import type { Pool } from 'pg';

type BuildTryOnPromptInput = {
  db: Pool;
  sessionId: string;
  personAssetId: string;
  lookId?: string | null;
  clothingUrl?: string | null;
};

const ATMOSPHERES = [
  'Vogue editorial fashion photography, luxury campaign quality',
  "Harper's Bazaar — premium, confident, modern",
  'high-end fashion lookbook, aspirational lifestyle editorial',
  'contemporary street style editorial, bold and sophisticated',
  'premium brand campaign, clean elegance',
];

const LOCATIONS = [
  'sunlit Mediterranean terrace with flowering plants, soft warm bokeh',
  'elegant marble hotel lobby, high ceilings, natural light streaming in',
  'cobblestone street in Paris at golden hour, soft blurred background',
  'modern penthouse interior, floor-to-ceiling windows, city skyline view',
  'lush botanical greenhouse, diffused light through glass ceiling',
  'rooftop at sunset, urban skyline softly out of focus',
  'contemporary art gallery interior, white walls, polished concrete floor',
  'luxury fashion atelier, cream tones, natural light from tall arched windows',
  'Japanese zen garden, soft morning mist, clean minimal lines',
  'Scandinavian forest path, overcast diffused light, clean natural tones',
  'modern museum exterior steps, architectural columns, bright natural light',
  'beach promenade at golden hour, turquoise sea softly blurred in distance',
];

const CAMERA_STYLES = [
  'Canon EOS R5, 85mm f/1.8 portrait lens, shallow depth of field, subject tack sharp',
  'Sony A7R V, 85mm f/1.4 G Master, beautiful background roll-off bokeh',
  'Hasselblad X2D, 80mm, medium format detail, crisp editorial quality',
  'Leica SL3, 75mm Summilux, cinematic background separation',
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
  'Virtual try-on fashion editorial. ' +
  'The person from IMAGE 1 is wearing the exact outfit from IMAGE 2. ' +
  'Preserve exact face, skin tone, hair, body shape from IMAGE 1. ' +
  'Preserve exact garment color, print, cut, fabric texture from IMAGE 2. ' +
  'Scene: elegant sunlit terrace, soft garden bokeh. ' +
  'Style: Vogue premium editorial. Camera: Sony A7R V, 85mm f/1.8. ' +
  'Vertical 9:16, hyper-realistic, pin-sharp subject.';

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
      'Virtual try-on fashion editorial photograph.',
      'The person from IMAGE 1 is wearing the exact outfit shown in IMAGE 2.',
      'PRESERVE from IMAGE 1: exact face features, skin tone, hair, body shape and proportions, natural pose — do not alter the person.',
      'PRESERVE from IMAGE 2: exact garment silhouette, color, print/pattern, fabric texture, and every design detail — do not change the outfit.',
      'Do not use backgrounds from either input image.',
      `Scene: ${location}.`,
      `Style: ${atmosphere}.`,
      `Photography: ${camera}, vertical 9:16, rule of thirds, full or 3/4 figure frame.`,
      'Output: hyper-realistic, pin-sharp subject, beautiful background bokeh, premium quality.',
    ];

    if (personDesc) {
      parts.push(`Person reference: ${personDesc}.`);
    }

    const clothingHints = [clothingCtx.title, clothingCtx.description, clothingAiDesc].filter(Boolean).join('. ');
    if (clothingHints) {
      parts.push(`Garment reference: ${clothingHints}.`);
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
    'Virtual try-on fashion editorial photograph.',
    'The person from IMAGE 1 is wearing the exact outfit shown in IMAGE 2.',
    'PRESERVE from IMAGE 1: exact face features, skin tone, hair, body shape and proportions, natural pose — do not alter the person.',
    'PRESERVE from IMAGE 2: exact garment silhouette, color, print/pattern, fabric texture, and every design detail — do not change the outfit.',
    'Do not use backgrounds from either input image.',
    `Scene: ${location}.`,
    `Style: ${atmosphere}.`,
    `Photography: ${camera}, vertical 9:16, rule of thirds, full or 3/4 figure frame.`,
    'Output: hyper-realistic, pin-sharp subject, beautiful background bokeh, premium fashion magazine quality.',
  ].join(' ');
}

