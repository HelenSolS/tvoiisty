/**
 * POST /api/generate-video — генерация видео по URL результата примерки.
 * body.model передаётся в kieClient (для Veo — подставляется в запрос; Runway/Kling и др. — только в api/generate-video на Vercel).
 */

import type { Request, Response } from 'express';
import { generateVideoFromImage } from '../kieClient.js';
import { getSetting } from '../settings.js';
import { logAiGeneration } from '../aiLogs.js';

const PRIMARY_VIDEO_MODEL = 'grok-imagine/image-to-video';
const FALLBACK_VIDEO_MODEL = 'kling/v2-1-standard';

const VIDEO_MODEL_POOL = [
  PRIMARY_VIDEO_MODEL,
  FALLBACK_VIDEO_MODEL,
  'veo-3-1',
  'runway/gen-3-alpha-turbo',
  'hailuo/2-3-image-to-video-standard',
  'wan/2-2-a14b-image-to-video-turbo',
] as const;

function mapVideoErrorToStatus(message: string): number {
  const m = message.toLowerCase();
  if (m.includes('время ожидания') || m.includes('timeout')) return 408;
  if (m.includes('не удалась') || m.includes('генерация') || m.includes('failed')) return 422;
  if (
    m.includes('supabase') ||
    m.includes('blob') ||
    m.includes('storage') ||
    m.includes('не удалось сохранить')
  ) {
    return 503;
  }
  return 500;
}

async function resolveVideoModel(bodyModel: unknown): Promise<string> {
  if (typeof bodyModel === 'string' && (VIDEO_MODEL_POOL as readonly string[]).includes(bodyModel))
    return bodyModel;
  const fromSettings = await getSetting<string>('DEFAULT_VIDEO_MODEL');
  if (typeof fromSettings === 'string' && fromSettings.trim()) return fromSettings.trim();
  return process.env.KIE_VIDEO_MODEL || PRIMARY_VIDEO_MODEL;
}

export async function generateVideoHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { imageUrl?: string; prompt?: string; model?: string };
  const { imageUrl, model: bodyModel } = body;
  const model = await resolveVideoModel(bodyModel);

  if (!imageUrl || typeof imageUrl !== 'string') {
    res.status(400).json({ error: 'Нужен imageUrl (результат примерки)' });
    return;
  }

  const start = Date.now();
  try {
    let usedModel = model;
    let videoUrl: string;
    try {
      videoUrl = await generateVideoFromImage(imageUrl, body.prompt, model);
    } catch (primaryErr) {
      // Канон: для видео primary=Grok, fallback=Kling.
      if (model !== PRIMARY_VIDEO_MODEL) throw primaryErr;
      videoUrl = await generateVideoFromImage(imageUrl, body.prompt, FALLBACK_VIDEO_MODEL);
      usedModel = `${model}->${FALLBACK_VIDEO_MODEL}`;
    }
    const durationMs = Date.now() - start;
    try {
      await logAiGeneration({
        kind: 'video',
        provider: 'kie',
        model: usedModel,
        durationMs,
        status: 'success',
      });
    } catch (logErr) {
      console.warn('[generate-video] logAiGeneration success failed', logErr);
    }
    res.status(200).json({ videoUrl });
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Ошибка генерации видео';
    try {
      await logAiGeneration({
        kind: 'video',
        provider: 'kie',
        model,
        durationMs,
        status: 'error',
        errorMessage: message,
      });
    } catch (logErr) {
      console.warn('[generate-video] logAiGeneration error failed', logErr);
    }
    res.status(mapVideoErrorToStatus(message)).json({ error: message });
  }
}
