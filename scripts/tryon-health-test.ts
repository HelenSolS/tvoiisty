/**
 * TryOn health test: upload → tryon → poll result.
 * Запуск: npx tsx scripts/tryon-health-test.ts
 * Опционально: TRYON_HEALTH_BASE_URL=https://api.tvoiistyle.top npx tsx scripts/tryon-health-test.ts
 * Лог: logs/tryon-health.log
 */

import fs from 'fs';
import path from 'path';

const BASE = process.env.TRYON_HEALTH_BASE_URL ?? process.env.TEST_SERVER_URL ?? 'http://localhost:3000';
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'tryon-health.log');
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;

// Минимальный 1x1 PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function log(line: string): void {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const full = `${ts} ${line}\n`;
  fs.appendFileSync(LOG_FILE, full);
  console.log(full.trim());
}

async function uploadFile(type: 'person' | 'clothing'): Promise<{ assetId: string }> {
  const form = new FormData();
  form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), `${type}.png`);
  form.append('type', type);
  const res = await fetch(`${BASE}/api/media/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`upload ${type} failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as { assetId?: string };
  if (!data?.assetId) throw new Error(`upload ${type}: no assetId`);
  return { assetId: data.assetId };
}

async function createTryon(personAssetId: string, clothingImageUrl: string): Promise<{ tryon_id: string }> {
  const res = await fetch(`${BASE}/api/tryon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person_asset_id: personAssetId,
      clothing_image_url: clothingImageUrl,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`tryon create failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as { tryon_id?: string };
  if (!data?.tryon_id) throw new Error('tryon create: no tryon_id');
  return { tryon_id: data.tryon_id };
}

async function pollTryonStatus(tryonId: string): Promise<{ status: string; image_url?: string | null; error?: string | null }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/api/tryon/${encodeURIComponent(tryonId)}`);
    if (!res.ok) throw new Error(`tryon status: ${res.status}`);
    const data = (await res.json()) as { status?: string; image_url?: string | null; error?: string | null };
    if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
      return data;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('timeout');
}

async function main(): Promise<void> {
  const start = Date.now();
  try {
    const [personRes, clothingRes] = await Promise.all([
      uploadFile('person'),
      (async () => {
        const form = new FormData();
        form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'clothing.png');
        form.append('type', 'clothing');
        const res = await fetch(`${BASE}/api/media/upload`, { method: 'POST', body: form });
        if (!res.ok) throw new Error(`upload clothing: ${res.status}`);
        const data = (await res.json()) as { assetId?: string; url?: string };
        return { assetId: data?.assetId, url: data?.url };
      })(),
    ]);
    const personAsset = personRes.assetId;
    const clothingUrl = (clothingRes as { url?: string })?.url;
    if (!clothingUrl) throw new Error('upload clothing: no url');

    const { tryon_id } = await createTryon(personAsset, clothingUrl);
    const result = await pollTryonStatus(tryon_id);
    const durationSec = ((Date.now() - start) / 1000).toFixed(1);

    if (result.status === 'completed' && result.image_url) {
      log(`OK duration=${durationSec}s`);
    } else {
      log(`ERROR stage=tryon status=${result.status} error=${result.error ?? 'no image'}`);
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const durationSec = ((Date.now() - start) / 1000).toFixed(1);
    log(`ERROR stage=provider ${msg} duration=${durationSec}s`);
    process.exit(1);
  }
}

main();
