import type { Pool } from 'pg';

type BuildTryOnPromptInput = {
  db: Pool;
  sessionId: string;
  personAssetId: string;
  lookId?: string | null;
  clothingUrl?: string | null;
};

const ATMOSPHERES = [
  'premium editorial mood',
  'modern confident fashion mood',
  'clean luxury campaign mood',
  'cinematic magazine look',
];

const BACKGROUNDS = [
  'soft beige-gray studio backdrop',
  'minimal light concrete background',
  'clean neutral gallery interior',
  'elegant blurred city backdrop',
];

const CAMERA_STYLES = [
  'Sony A7R V, 85mm f/1.8, shallow depth of field',
  'Canon EOS R5, 50mm, crisp editorial framing',
  'high-end fashion photo, rule of thirds, vertical composition',
  'premium studio lighting with subtle rim light, vertical frame',
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
  'Put the garment from the second image onto the person in the first image. Preserve character identity, body proportions and garment fit. Keep it realistic, elegant and fashion-editorial. Vertical frame, clean premium background, soft directional lighting.';

export async function buildTryOnPrompt(input: BuildTryOnPromptInput): Promise<string> {
  const { db, sessionId, personAssetId, lookId, clothingUrl } = input;

  try {
    const [personDesc, clothingCtx] = await Promise.all([
      getAssetAnalysisDescription(db, personAssetId),
      resolveClothingContext(db, lookId, clothingUrl),
    ]);

    const clothingAiDesc = await getAssetAnalysisDescription(db, clothingCtx.assetId);

    const atmosphere = pickSeeded(ATMOSPHERES, sessionId, 11);
    const background = pickSeeded(BACKGROUNDS, sessionId, 23);
    const camera = pickSeeded(CAMERA_STYLES, sessionId, 37);

    const parts: string[] = [
      'Apply the garment from the second image to the person in the first image.',
      'Preserve exact identity, face, body proportions, and natural pose.',
      'Preserve garment category, fit, material feel, and key design details.',
      `Style direction: ${atmosphere}.`,
      `Background: ${background}.`,
      `Camera and lighting: ${camera}.`,
      'Output must be hyper-realistic, premium fashion editorial quality.',
    ];

    if (personDesc) {
      parts.push(`Person reference details: ${personDesc}.`);
    }

    const clothingHints = [clothingCtx.title, clothingCtx.description, clothingAiDesc].filter(Boolean).join('. ');
    if (clothingHints) {
      parts.push(`Garment reference details: ${clothingHints}.`);
    }

    const prompt = parts.join(' ');
    return prompt.trim() || FALLBACK_PROMPT;
  } catch (err) {
    console.warn('[tryon-prompt] fallback to default prompt', err);
    return FALLBACK_PROMPT;
  }
}

