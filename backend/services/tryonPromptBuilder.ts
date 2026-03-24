import type { Pool } from 'pg';

type BuildTryOnPromptInput = {
  db: Pool;
  sessionId: string;
  personAssetId: string;
  lookId?: string | null;
  clothingUrl?: string | null;
};

const PROMPT_CORE = `You are doing a virtual fashion try-on.

The FIRST image is the PERSON (identity reference).
The SECOND image is the OUTFIT (clothing reference only).

Dress the person from the FIRST image in the outfit from the SECOND image.
Remove or ignore the original clothing from the person image.

Preserve the person's identity: same face, age, gender expression, hairstyle and overall build.
Preserve the outfit design from the second image: color, fabric, cut, silhouette and key details.
Adapt the outfit naturally to the person's body, pose and camera angle.

Do not stylize or redraw the face.
The final result must look like a real photo of this person wearing this outfit.

Full body visible. Natural posture. Premium fashion photography style.`;

const SCENE_POOL = [
  'modern gym with dramatic lighting',
  'sunrise mountain trail with fresh air',
  'sunset ocean shore with golden light',
  'luxury yacht deck',
  'coastal promenade',
  'clean white gallery interior',
  'luxury minimalist penthouse',
  'high-end showroom interior',
  'modern downtown street',
  'glass skyscraper district',
  'evening city lights boulevard',
  'forest clearing with sun rays',
  'mountain valley landscape',
  'luxury fashion boutique interior',
  'rooftop terrace with city view',
  'modern architectural concrete space',
];

const LIGHTING_POOL = [
  'golden hour sunset light',
  'soft morning diffused light',
  'bright clean studio lighting',
  'warm evening ambient light',
  'dramatic cinematic side light',
  'soft natural window light',
];

const CAMERA_STYLES = [
  'full body fashion shot, Canon EOS R5, 85mm f/1.8',
  'editorial standing pose, Sony A7R V, 85mm f/1.4',
  'wide cinematic shot, Hasselblad X2D, 80mm',
  'walking lifestyle shot, Canon EOS R5, 50mm f/1.2',
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

const FALLBACK_PROMPT = [
  PROMPT_CORE,
  'Environment: high-end showroom interior.',
  'Lighting: soft natural window light.',
  'Camera: editorial standing pose, Sony A7R V, 85mm f/1.4.',
  'cinematic lighting, natural skin texture, premium editorial fashion photography, photorealistic.',
].join('\n\n');

export async function buildTryOnPrompt(input: BuildTryOnPromptInput): Promise<string> {
  const { db, sessionId, personAssetId, lookId, clothingUrl } = input;

  try {
    const [personDesc, clothingCtx] = await Promise.all([
      getAssetAnalysisDescription(db, personAssetId),
      resolveClothingContext(db, lookId, clothingUrl),
    ]);

    const clothingAiDesc = await getAssetAnalysisDescription(db, clothingCtx.assetId);

    const scene = pickSeeded(SCENE_POOL, sessionId, 23);
    const lighting = pickSeeded(LIGHTING_POOL, sessionId, 11);
    const camera = pickSeeded(CAMERA_STYLES, sessionId, 37);

    const parts: string[] = [
      PROMPT_CORE,
      `Environment: ${scene}.`,
      `Lighting: ${lighting}.`,
      `Camera: ${camera}.`,
      'cinematic lighting, natural skin texture, premium editorial fashion photography, soft depth of field, high detail, photorealistic.',
    ];

    if (personDesc) {
      parts.push(`Person context: ${personDesc}.`);
    }

    const clothingHints = [clothingCtx.title, clothingCtx.description, clothingAiDesc].filter(Boolean).join('. ');
    if (clothingHints) {
      parts.push(`Outfit context: ${clothingHints}.`);
    }

    const prompt = parts.join('\n\n');
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
  const scene = pickSeeded(SCENE_POOL, seed, 7);
  const lighting = pickSeeded(LIGHTING_POOL, seed, 13);
  const camera = pickSeeded(CAMERA_STYLES, seed, 31);

  return [
    PROMPT_CORE,
    `Environment: ${scene}.`,
    `Lighting: ${lighting}.`,
    `Camera: ${camera}.`,
    'cinematic lighting, natural skin texture, premium editorial fashion photography, soft depth of field, high detail, photorealistic.',
  ].join('\n\n');
}

