import { pool } from './db.js';
import type { MediaType } from './media.js';
import { callChat, type ChatMessage } from './openrouter.js';

export type AnalysisStatus = 'pending' | 'running' | 'success' | 'error';

interface AnalysisJob {
  assetId: string;
  type: MediaType;
  analysisType: string;
}

let queue: AnalysisJob[] = [];
let isProcessing = false;

export async function getExistingSuccessfulAnalysis(
  assetId: string,
  analysisType: string,
): Promise<unknown | null> {
  const res = await pool.query<{
    result: unknown;
  }>(
    `
    SELECT result
    FROM ai_analyses
    WHERE asset_id = $1
      AND analysis_type = $2
      AND status = 'success'
    LIMIT 1
    `,
    [assetId, analysisType],
  );
  return res.rows[0]?.result ?? null;
}

export function enqueuePhotoAnalysis(job: AnalysisJob): void {
  queue.push(job);
  if (!isProcessing) {
    isProcessing = true;
    // Запускаем обработку в фоне, не блокируя HTTP-ответ.
    void processQueue();
  }
}

async function processQueue(): Promise<void> {
  while (queue.length > 0) {
    const job = queue.shift()!;
    try {
      await runAnalysisJob(job);
    } catch (err) {
      console.error('[aiPhotoPipeline] job failed', {
        assetId: job.assetId,
        analysisType: job.analysisType,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  isProcessing = false;
}

async function runAnalysisJob(job: AnalysisJob): Promise<void> {
  // Если уже есть успешный анализ — ничего не делаем (кеш по asset_id + analysis_type).
  const existing = await getExistingSuccessfulAnalysis(job.assetId, job.analysisType);
  if (existing) return;

  // Создаём/обновляем запись анализа в статусе running.
  const upsertRes = await pool.query<{
    id: string;
  }>(
    `
    INSERT INTO ai_analyses (asset_id, analysis_type, status)
    VALUES ($1, $2, 'running')
    ON CONFLICT (asset_id, analysis_type)
    DO UPDATE SET status = 'running', updated_at = NOW()
    RETURNING id
    `,
    [job.assetId, job.analysisType],
  );

  const analysisId = upsertRes.rows[0]?.id;

  // Получаем данные ассета, чтобы сформировать контекст для LLM.
  const assetRes = await pool.query<{
    type: MediaType;
    original_url: string;
    hash: string;
  }>('SELECT type, original_url, hash FROM media_assets WHERE id = $1', [job.assetId]);

  const asset = assetRes.rows[0];
  if (!asset) {
    console.error('[aiPhotoPipeline] asset not found for analysis', { assetId: job.assetId });
    return;
  }

  const messages = buildPhotoAnalysisPrompt(asset.type, asset.original_url);

  try {
    const raw = await callChat(messages, {
      model: 'google/gemini-2.5-flash-lite',
      maxTokens: 800,
    });

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Если модель вернула невалидный JSON — сохраняем как есть в строке.
      parsed = { raw };
    }

    await pool.query(
      `
      UPDATE ai_analyses
      SET status = 'success',
          result = $1::jsonb,
          error_message = NULL,
          updated_at = NOW()
      WHERE id = $2
      `,
      [JSON.stringify(parsed), analysisId],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `
      UPDATE ai_analyses
      SET status = 'error',
          error_message = $1,
          updated_at = NOW()
      WHERE id = $2
      `,
      [message, analysisId],
    );
  }
}

function buildPhotoAnalysisPrompt(type: MediaType, url: string): ChatMessage[] {
  const typeLabel =
    type === 'person'
      ? 'фото человека'
      : type === 'clothing'
        ? 'фото одежды'
        : 'фото локации / сцены';

  const system: ChatMessage = {
    role: 'system',
    content:
      'Ты AI-помощник для fashion-платформы. ' +
      'Твоя задача — за один вызов выполнить 3 шага: ' +
      '1) модерация контента, 2) генерация описания, 3) извлечение метаданных. ' +
      'Всегда отвечай строго в формате JSON без пояснений и текста вокруг.',
  };

  const user: ChatMessage = {
    role: 'user',
    content:
      `Проанализируй ${typeLabel} по ссылке: ${url}\n\n` +
      'Верни JSON следующего формата:\n' +
      '{\n' +
      '  "moderation": {\n' +
      '    "safe": boolean,\n' +
      '    "reasons": string[]\n' +
      '  },\n' +
      '  "description": string,\n' +
      '  "metadata": {\n' +
      '    "tags": string[],\n' +
      '    "scene": string,\n' +
      '    "dominant_colors": string[],\n' +
      '    "shot_type": string,\n' +
      '    "fashion_style": string\n' +
      '  }\n' +
      '}\n\n' +
      'Не добавляй никаких комментариев вне JSON.',
  };

  return [system, user];
}

