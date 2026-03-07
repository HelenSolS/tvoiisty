/**
 * Tryon health-check pipeline (автотестер генерации).
 * Проверяет цепочку: API → Route → Engine → Storage → DB.
 *
 * Запуск:
 *   npx tsx scripts/tryon-health-check.ts
 *   TEST_SERVER_URL=https://api.tvoiistyle.top npx tsx scripts/tryon-health-check.ts
 *
 * Обязательные env для полного прогона (реальная примерка):
 *   HEALTH_PERSON_ASSET_ID  — UUID из media_assets (type=person)
 *   HEALTH_LOOK_ID          — UUID из looks
 * Опционально:
 *   HEALTH_POLL_MAX_SEC     — макс. секунд ожидания completed (по умолчанию 90)
 *   HEALTH_REPORT_FILE      — путь к файлу для JSON-отчёта
 *   TELEGRAM_BOT_TOKEN      — для алерта при ошибке
 *   TELEGRAM_CHAT_ID        — чат для алерта
 *   HEALTH_ALERT_AFTER_FAILURES — слать алерт после N подряд неудач (по умолчанию 3)
 */
import fs from 'fs';

const BASE = process.env.TEST_SERVER_URL ?? 'http://localhost:4000';
const PERSON_ASSET_ID = process.env.HEALTH_PERSON_ASSET_ID ?? '';
const LOOK_ID = process.env.HEALTH_LOOK_ID ?? '';
const POLL_MAX_SEC = Number(process.env.HEALTH_POLL_MAX_SEC) || 90;
const POLL_INTERVAL_MS = 3000;
const REPORT_FILE = process.env.HEALTH_REPORT_FILE ?? '';
const TELEGRAM_BOT = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID ?? '';
const ALERT_AFTER_FAILURES = Number(process.env.HEALTH_ALERT_AFTER_FAILURES) || 3;
const STATE_FILE = process.env.HEALTH_STATE_FILE ?? '.health-tryon-state.json';

type Report = {
  timestamp: string;
  test: string;
  status: 'ok' | 'error';
  stage?: 'route' | 'engine' | 'polling' | 'storage';
  error?: string;
  duration_seconds?: number;
  tryon_id?: string;
  image_url?: string;
  providerUsed?: string | null;
};

function writeReport(report: Report): void {
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (REPORT_FILE) {
    try {
      fs.writeFileSync(REPORT_FILE, json, 'utf8');
    } catch (e) {
      console.error('Failed to write report file', e);
    }
  }
}

function readState(): { consecutiveFailures: number; lastSuccessAt?: string } {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        consecutiveFailures: data.consecutiveFailures ?? 0,
        lastSuccessAt: data.lastSuccessAt,
      };
    }
  } catch {
    // ignore
  }
  return { consecutiveFailures: 0 };
}

function writeState(success: boolean): number {
  try {
    const prev = readState();
    const next = success
      ? { consecutiveFailures: 0, lastSuccessAt: new Date().toISOString() }
      : { consecutiveFailures: prev.consecutiveFailures + 1, lastSuccessAt: prev.lastSuccessAt };
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf8');
    return next.consecutiveFailures;
  } catch {
    return 0;
  }
}

async function sendTelegramAlert(report: Report): Promise<void> {
  if (!TELEGRAM_BOT || !TELEGRAM_CHAT) return;
  const text = [
    '🔴 TRYON HEALTH ALERT',
    `Status: ${report.status.toUpperCase()}`,
    report.stage ? `Stage: ${report.stage}` : '',
    report.error ? `Error: ${report.error}` : '',
    `Time: ${report.timestamp}`,
  ]
    .filter(Boolean)
    .join('\n');
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text }),
      }
    );
  } catch (e) {
    console.error('Telegram alert failed', e);
  }
}

async function run(): Promise<void> {
  const start = Date.now();
  const report: Report = {
    timestamp: new Date().toISOString(),
    test: 'tryon_health_check',
    status: 'ok',
  };

  if (!PERSON_ASSET_ID || !LOOK_ID) {
    report.status = 'error';
    report.stage = 'route';
    report.error = 'HEALTH_PERSON_ASSET_ID and HEALTH_LOOK_ID must be set for full tryon check.';
    report.duration_seconds = Math.round((Date.now() - start) / 1000);
    writeReport(report);
    process.exit(1);
  }

  try {
    // 1) Route: POST /api/tryon
    const createRes = await fetch(`${BASE}/api/tryon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_asset_id: PERSON_ASSET_ID,
        look_id: LOOK_ID,
      }),
    });

    if (createRes.status !== 201) {
      const errBody = await createRes.text();
      report.status = 'error';
      report.stage = 'route';
      report.error = `POST /api/tryon returned ${createRes.status}: ${errBody.slice(0, 200)}`;
      report.duration_seconds = Math.round((Date.now() - start) / 1000);
      writeReport(report);
      const failures = writeState(false);
      if (failures >= ALERT_AFTER_FAILURES) await sendTelegramAlert(report);
      process.exit(1);
    }

    const createData = (await createRes.json()) as { tryon_id?: string; status?: string };
    const tryonId = createData.tryon_id;
    if (!tryonId) {
      report.status = 'error';
      report.stage = 'route';
      report.error = 'No tryon_id in response';
      report.duration_seconds = Math.round((Date.now() - start) / 1000);
      writeReport(report);
      writeState(false);
      process.exit(1);
    }
    report.tryon_id = tryonId;

    // 2) Engine: poll until completed/failed or timeout
    const deadline = Date.now() + POLL_MAX_SEC * 1000;
    let lastStatus = createData.status;
    let imageUrl: string | null = null;
    let finalError: string | null = null;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const statusRes = await fetch(`${BASE}/api/tryon/${tryonId}`);
      if (!statusRes.ok) {
        report.status = 'error';
        report.stage = 'polling';
        report.error = `GET /api/tryon/${tryonId} returned ${statusRes.status}`;
        report.duration_seconds = Math.round((Date.now() - start) / 1000);
        writeReport(report);
        const failures = writeState(false);
        if (failures >= ALERT_AFTER_FAILURES) await sendTelegramAlert(report);
        process.exit(1);
      }

      const statusData = (await statusRes.json()) as {
        status: string;
        image_url?: string | null;
        error?: string | null;
      };
      lastStatus = statusData.status;
      imageUrl = statusData.image_url ?? null;
      finalError = statusData.error ?? null;

      if (lastStatus === 'completed') break;
      if (lastStatus === 'failed') {
        report.status = 'error';
        report.stage = 'engine';
        report.error = finalError || 'Tryon failed';
        report.duration_seconds = Math.round((Date.now() - start) / 1000);
        writeReport(report);
        const failures = writeState(false);
        if (failures >= ALERT_AFTER_FAILURES) await sendTelegramAlert(report);
        process.exit(1);
      }
    }

    if (lastStatus !== 'completed' || !imageUrl) {
      report.status = 'error';
      report.stage = 'engine';
      report.error =
        lastStatus !== 'completed'
          ? `Timeout: status stayed ${lastStatus} after ${POLL_MAX_SEC}s`
          : 'Completed but no image_url';
      report.duration_seconds = Math.round((Date.now() - start) / 1000);
      writeReport(report);
      const failures = writeState(false);
      if (failures >= ALERT_AFTER_FAILURES) await sendTelegramAlert(report);
      process.exit(1);
    }

    report.image_url = imageUrl;
    report.duration_seconds = Math.round((Date.now() - start) / 1000);

    // 3) Storage: результат доступен по URL (опционально)
    try {
      const imgRes = await fetch(imageUrl, { method: 'HEAD' });
      if (!imgRes.ok) {
        report.stage = 'storage';
        report.error = `Result image URL returned ${imgRes.status}`;
        report.status = 'error';
      }
    } catch (e) {
      report.stage = 'storage';
      report.error = e instanceof Error ? e.message : String(e);
      report.status = 'error';
    }

    writeReport(report);
    const failures = writeState(report.status === 'ok');
    if (report.status !== 'ok') {
      if (failures >= ALERT_AFTER_FAILURES) await sendTelegramAlert(report);
      process.exit(1);
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    report.status = 'error';
    report.stage = 'route';
    report.error = err;
    report.duration_seconds = Math.round((Date.now() - start) / 1000);
    writeReport(report);
    const failures = writeState(false);
    if (failures >= ALERT_AFTER_FAILURES) await sendTelegramAlert(report);
    process.exit(1);
  }
}

run();
