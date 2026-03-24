import type { Pool } from 'pg';

type BuildTryOnPromptInput = {
  db: Pool;
  sessionId: string;
  personAssetId: string;
  lookId?: string | null;
  clothingUrl?: string | null;
};

const ATMOSPHERES = [
  'Vogue fashion editorial',
  "Harper's Bazaar campaign",
  'high-end fashion lookbook',
  'contemporary fashion magazine spread',
  'luxury brand campaign',
];

const LOCATIONS = [
  'clean white editorial studio, professional softbox lighting, seamless backdrop',
  'modern rooftop, open sky, crisp natural daylight',
  'Mediterranean waterfront, calm sea visible in background, diffused overcast light',
  'sleek contemporary office lobby, glass and steel, cool natural light',
  'fashion showroom interior, white walls, soft window light',
  'outdoor urban plaza, modern glass architecture backdrop, even daylight',
  'minimal luxury apartment, large panoramic windows, neutral interior tones',
  'coastal cliff path, sea panorama, soft overcast diffused light',
  'city business district exterior, clean architectural lines, natural light',
  'contemporary art space, neutral walls, balanced studio lighting',
];

const CAMERA_STYLES = [
  'Canon EOS R5, 85mm f/1.8, tack sharp subject, soft background separation',
  'Sony A7R V, 85mm f/1.4 G Master, professional editorial framing',
  'Hasselblad X2D, 80mm, medium format, crisp fashion editorial quality',
  'Leica SL3, 75mm Summilux, clean professional portrait framing',
];

function pickSeeded<T>(items: T[], seed: string, salt: number): T {
  const n = Array.from(seed).reduce((acc, ch, idx) => acc + ch.charCodeAt(0) * (idx + 1 + salt), 0);
  return items[Math.abs(n) % items.length];
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDescription(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const obj = raw as Record<string, unknown>;
  const description = toText(obj.description);
  if (description) return description;
  const metadata = obj.metadata;
  if (metadata && typeof metadata === 'object') {
    const m = metadata as Record<string, unknown>;
    const tags = Array.isArray(m.tags) ? m.tags.map((x) => toText(x)).filter(Boolean).slice(0, 6) : [];
    if (tags.length > 0) return tags.join(', ');
  }
  return '';
}

async function getAssetAnalysisDescription(db: Pool, assetId: string | null | undefined): Promise<string> {
  if (!assetId) return '';
  try {
    const res = await db.query<{ result: unknown }>(
      `
      SELECT result
      FROM ai_analyses
      WHERE asset_id = $1
        AND analysis_type = 'photo_llm_v1'
        AND status = 'success'
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [assetId],
    );
    return normalizeDescription(res.rows[0]?.result);
  } catch (err) {
    console.warn('[tryon-prompt] failed to read ai_analyses', err);
    return '';
  }
}

async function resolveClothingContext(
  db: Pool,
  lookId?: string | null,
  clothingUrl?: string | null,
): Promise<{ title: string; description: string; assetId: string | null }> {
  if (lookId) {
    try {
      const lookRes = await db.query<{
        title: string | null;
        description: string | null;
        main_asset_id: string | null;
      }>(
        `
        SELECT l.title, l.description, l.main_asset_id
        FROM looks l
        WHERE l.id = $1
        LIMIT 1
        `,
        [lookId],
      );
      const row = lookRes.rows[0];
      if (row) {
        return {
          title: toText(row.title),
          description: toText(row.description),
          assetId: row.main_asset_id ?? null,
        };
      }
    } catch (err) {
      console.warn('[tryon-prompt] failed to read look context', err);
    }
  }

  if (clothingUrl && clothingUrl.startsWith('http')) {
    try {
      const assetRes = await db.query<{ id: string }>(
        `
        SELECT id
        FROM media_assets
        WHERE original_url = $1
        LIMIT 1
        `,
        [clothingUrl],
      );
      const assetId = assetRes.rows[0]?.id ?? null;
      return { title: '', description: '', assetId };
    } catch (err) {
      console.warn('[tryon-prompt] failed to resolve clothing asset by URL', err);
    }
  }

  return { title: '', description: '', assetId: null };
}

const FALLBACK_PROMPT =
  'Virtual try-on. Person from IMAGE 1 wearing the outfit from IMAGE 2. ' +
  'Preserve face, skin tone, body shape exactly from IMAGE 1. ' +
  'Preserve garment color, cut, texture exactly from IMAGE 2. ' +
  'Background: clean white editorial studio, professional soft light. ' +
  'Vogue fashion editorial. Canon EOS R5, 85mm f/1.8. Vertical 9:16. Hyper-realistic.';

export async function buildTryOnPrompt(input: BuildTryOnPromptInput): Promise<string> {
  const { db, sessionId, personAssetId, lookId, clothingUrl } = input;

  try {
    const [personDesc, clothingCtx] = await Promise.all([
      getAssetAnalysisDescription(db, personAssetId),
      resolveClothingContext(db, lookId, clothingUrl),
    ]);

    const clothingAiDesc = await getAssetAnalysisDescription(db, clothingCtx.assetId);

    const atmosphere = pickSeeded(ATMOSPHERES, sessionId, 11);
    const location = pickSeeded(LOCATIONS, sessionId, 23);
    const camera = pickSeeded(CAMERA_STYLES, sessionId, 37);

    const parts: string[] = [
      'Virtual try-on.',
      'Person from IMAGE 1 wearing the outfit from IMAGE 2.',
      'Preserve face, skin tone, hair, body shape exactly from IMAGE 1.',
      'Preserve garment color, cut, print, fabric texture exactly from IMAGE 2.',
      `Background: ${location}.`,
      `${atmosphere}.`,
      `${camera}. Vertical 9:16. Hyper-realistic, sharp subject.`,
    ];

    if (personDesc) {
      parts.push(`Person: ${personDesc}.`);
    }

    const clothingHints = [clothingCtx.title, clothingCtx.description, clothingAiDesc].filter(Boolean).join('. ');
    if (clothingHints) {
      parts.push(`Outfit: ${clothingHints}.`);
    }

    const prompt = parts.join(' ');
    return prompt.trim() || FALLBACK_PROMPT;
  } catch (err) {
    console.warn('[tryon-prompt] fallback to default prompt', err);
    return FALLBACK_PROMPT;
  }
}

/**
 * Быстрый промпт для lite-потока — без обращений к БД.
 * Рандомизирует локацию, атмосферу и камеру по seed (текущее время).
 */
export function buildLiteTryOnPrompt(): string {
  const seed = String(Date.now());
  const location = pickSeeded(LOCATIONS, seed, 7);
  const atmosphere = pickSeeded(ATMOSPHERES, seed, 13);
  const camera = pickSeeded(CAMERA_STYLES, seed, 31);

  return [
    'Virtual try-on.',
    'Person from IMAGE 1 wearing the outfit from IMAGE 2.',
    'Preserve face, skin tone, hair, body shape exactly from IMAGE 1.',
    'Preserve garment color, cut, print, fabric texture exactly from IMAGE 2.',
    `Background: ${location}.`,
    `${atmosphere}.`,
    `${camera}. Vertical 9:16. Hyper-realistic, sharp subject.`,
  ].join(' ');
}

