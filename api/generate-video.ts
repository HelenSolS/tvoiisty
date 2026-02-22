/**
 * Backend-эндпоинт: генерация видео через KIE.
 * Veo: POST /api/v1/veo/generate, опрос veo/record-info.
 * Runway: POST /api/v1/runway/generate, опрос runway/record-detail (state → videoInfo.videoUrl).
 * Kling, Hailuo, Wan, Grok: POST /api/v1/jobs/createTask, опрос jobs/recordInfo. Всегда 9:16 где применимо.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Req = { method?: string; body?: Record<string, unknown> };
type Res = { status: (n: number) => { json: (o: object) => void } };

const DEFAULT_KIE_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 80;

function isVeoModel(model: string): boolean {
  return model.startsWith('veo');
}

function isRunwayModel(model: string): boolean {
  return model.startsWith('runway');
}

/**
 * Формат input для jobs/createTask разный у каждой модели (KIE OpenAPI).
 * Строим payload по спецификации: Kling — image_url, Grok — image_urls, Hailuo — image_url + resolution и т.д.
 */
function buildJobsCreateTaskInput(
  model: string,
  imageUrl: string,
  prompt: string
): Record<string, unknown> {
  switch (model) {
    case 'kling/v2-1-standard':
      return {
        prompt,
        image_url: imageUrl,
        duration: '5',
      };
    case 'grok-imagine/image-to-video':
      return {
        image_urls: [imageUrl],
        prompt,
        mode: 'normal',
        duration: '6',
        resolution: '480p',
      };
    case 'wan/2-2-a14b-image-to-video-turbo':
      return {
        image_url: imageUrl,
        prompt,
        resolution: '720p',
      };
    case 'hailuo/2-3-image-to-video-standard':
    case 'hailuo/02-image-to-video-standard':
      return {
        prompt,
        image_url: imageUrl,
        duration: '10',
        resolution: '768P',
        prompt_optimizer: true,
      };
    default:
      return {
        input_urls: [imageUrl],
        prompt,
        aspect_ratio: '9:16',
      };
  }
}

/** Пул моделей для видео (Lab dev). Veo в KIE: только veo3_fast. */
const VIDEO_MODEL_POOL = [
  'kling/v2-1-standard',
  'veo-3-1',
  'runway/gen-3-alpha-turbo',
  'hailuo/2-3-image-to-video-standard',
  'wan/2-2-a14b-image-to-video-turbo',
  'grok-imagine/image-to-video',
] as const;

const DEFAULT_VIDEO_MODEL = 'veo-3-1';

function resolveVideoModel(bodyModel: unknown): string {
  if (typeof bodyModel === 'string' && (VIDEO_MODEL_POOL as readonly string[]).includes(bodyModel))
    return bodyModel;
  return DEFAULT_VIDEO_MODEL;
}

/** Расширенный промпт для Veo (duration, aspect, по KIE_Video_API_Reference). */
const VEO_EXTENDED_PROMPT = `Create a short high-end fashion advertisement video based on the provided image.

The character must preserve full facial identity and body proportions.
The outfit must remain identical in color, fit, and texture.

Scene (5–8 seconds):

Shot 1:
Subtle camera push-in.
Character takes a soft step forward.
Fabric moves naturally.

Shot 2:
Gentle body turn.
Light glides across the fabric surface.
Highlight garment fit and texture.

Shot 3:
Close-up of clothing details.
Natural fabric motion.
Confident eye contact with camera.

Lighting remains consistent with the original image.
Neutral premium color grading.
Cinematic smooth dolly camera movement.

Atmosphere: modern fashion brand advertisement.
Clean, stylish, minimal environment.`;

/** Короткий промпт для не-Veo моделей. */
const DEFAULT_VIDEO_PROMPT = 'Fashion film, person moves, outfit visible. Soft lighting, cinematic.';

function extractVideoUrl(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const inner = d.data as Record<string, unknown> | undefined;
  const target = (inner && typeof inner === 'object' ? inner : d) as Record<string, unknown>;

  const output = target.output as Record<string, unknown> | undefined;
  if (output?.video && typeof (output.video as { url?: string }).url === 'string') {
    return (output.video as { url: string }).url;
  }
  const result = target.result as Record<string, unknown> | undefined;
  if (result?.video_url && typeof result.video_url === 'string') return result.video_url as string;
  const videos = result?.videos as Array<{ url?: string }> | undefined;
  if (Array.isArray(videos) && videos[0]?.url) return videos[0].url;
  const response = target.response as Record<string, unknown> | undefined;
  if (response && typeof response === 'object') {
    if (Array.isArray(response.resultUrls) && response.resultUrls[0] && typeof response.resultUrls[0] === 'string') return response.resultUrls[0] as string;
    if (Array.isArray(response.result_urls) && response.result_urls[0]) return response.result_urls[0] as string;
    if (typeof response.video_url === 'string') return response.video_url;
  }
  return undefined;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const KIE_BASE = (process.env.KIE_BASE_URL || DEFAULT_KIE_BASE).replace(/\/$/, '');
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    console.error('[generate-video] KIE_API_KEY not set');
    return res.status(500).json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const model = resolveVideoModel(body.model);
  const startTs = Date.now();

  try {
    const { imageUrl, prompt } = body as { imageUrl?: string; prompt?: string };
    if (!imageUrl) {
      return res.status(400).json({ error: 'Недостаточно данных для создания видео.' });
    }

    const useVeo = isVeoModel(model);
    const videoPrompt = prompt || (useVeo ? VEO_EXTENDED_PROMPT : DEFAULT_VIDEO_PROMPT);

    if (useVeo) {
      // Veo 3.1: POST /api/v1/veo/generate. В KIE — только veo3_fast.
      const veoModelKie = 'veo3_fast';
      const payload: Record<string, unknown> = {
        prompt: videoPrompt,
        imageUrls: [imageUrl],
        model: veoModelKie,
        aspect_ratio: '9:16',
        generationType: 'FIRST_AND_LAST_FRAMES_2_VIDEO',
      };
      const createRes = await fetch(`${KIE_BASE}/veo/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let createData: { data?: { taskId?: string; creditsUsed?: number }; message?: string; msg?: string } = {};
      try {
        createData = await createRes.json();
      } catch (e) {
        const endTs = Date.now();
        console.error('[generate-video] veo/generate', { model, startTs, endTs, durationMs: endTs - startTs, httpStatus: createRes.status, error: 'response not JSON' });
        return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
      }

      const endTs = Date.now();
      const creditsUsed = createData?.data?.creditsUsed;
      console.error('[generate-video] veo/generate', { model, startTs, endTs, durationMs: endTs - startTs, httpStatus: createRes.status, creditsUsed, ...(createData?.msg ? { msg: createData.msg } : {}) });

      if (!createRes.ok) {
        return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
      }

      const taskId = createData?.data?.taskId;
      if (!taskId) {
        return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
      }

      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        const jobRes = await fetch(`${KIE_BASE}/veo/record-info?taskId=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        let jobData: { data?: { successFlag?: number | string }; message?: string } = {};
        try {
          jobData = await jobRes.json();
        } catch {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          continue;
        }
        if (!jobRes.ok) {
          const totalMs = Date.now() - startTs;
          console.error('[generate-video] veo/record-info', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: jobRes.status });
          return res.status(502).json({ error: 'Не удалось получить видео. Попробуйте позже.' });
        }

        const flag = jobData?.data?.successFlag;
        if (flag === 1 || flag === '1') {
          const videoUrl = extractVideoUrl(jobData?.data);
          if (videoUrl) {
            const totalMs = Date.now() - startTs;
            console.error('[generate-video] success', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 200 });
            return res.status(200).json({ videoUrl });
          }
          const totalMs = Date.now() - startTs;
          console.error('[generate-video] successFlag=1 but no videoUrl', { model, startTs, endTs: Date.now(), durationMs: totalMs });
          return res.status(500).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
        }
        if (flag === 2 || flag === 3 || flag === '2' || flag === '3') {
          const totalMs = Date.now() - startTs;
          console.error('[generate-video] fail', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 422, successFlag: flag });
          return res.status(422).json({
            error: 'Генерация видео не удалась. Попробуйте снова.',
          });
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      const totalMs = Date.now() - startTs;
      console.error('[generate-video] timeout', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 408 });
      return res.status(408).json({
        error: 'Превышено время ожидания для видео. Попробуйте ещё раз.',
      });
    }

    if (isRunwayModel(model)) {
      // Runway: отдельный эндпоинт runway/generate + runway/record-detail (KIE Runway API Quickstart)
      const runwayPayload = {
        prompt: videoPrompt,
        imageUrl,
        duration: 5,
        quality: '720p',
        aspectRatio: '9:16',
      };
      const createRes = await fetch(`${KIE_BASE}/runway/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(runwayPayload),
      });

      let createData: { data?: { taskId?: string }; code?: number; msg?: string } = {};
      try {
        createData = await createRes.json();
      } catch (e) {
        const endTs = Date.now();
        console.error('[generate-video] runway/generate', { model, startTs, endTs, durationMs: endTs - startTs, httpStatus: createRes.status, error: 'response not JSON' });
        return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
      }

      const endTs = Date.now();
      console.error('[generate-video] runway/generate', { model, startTs, endTs, durationMs: endTs - startTs, httpStatus: createRes.status, ...(createData?.msg ? { msg: createData.msg } : {}) });

      if (!createRes.ok || createData.code !== 200) {
        return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
      }

      const taskId = createData?.data?.taskId;
      if (!taskId) {
        return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
      }

      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        const jobRes = await fetch(`${KIE_BASE}/runway/record-detail?taskId=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        let jobData: { data?: { state?: string; videoInfo?: { videoUrl?: string }; failMsg?: string }; code?: number } = {};
        try {
          jobData = await jobRes.json();
        } catch {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          continue;
        }
        if (!jobRes.ok) {
          const totalMs = Date.now() - startTs;
          console.error('[generate-video] runway/record-detail', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: jobRes.status });
          return res.status(502).json({ error: 'Не удалось получить видео. Попробуйте позже.' });
        }

        const state = jobData?.data?.state;
        if (state === 'success') {
          const videoUrl = jobData?.data?.videoInfo?.videoUrl;
          if (typeof videoUrl === 'string') {
            const totalMs = Date.now() - startTs;
            console.error('[generate-video] success', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 200 });
            return res.status(200).json({ videoUrl });
          }
        }
        if (state === 'fail') {
          const totalMs = Date.now() - startTs;
          console.error('[generate-video] fail', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 422, errorMessage: jobData?.data?.failMsg });
          return res.status(422).json({
            error: 'Генерация видео не удалась. Попробуйте снова.',
          });
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      const totalMs = Date.now() - startTs;
      console.error('[generate-video] timeout', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 408 });
      return res.status(408).json({
        error: 'Превышено время ожидания для видео. Попробуйте ещё раз.',
      });
    }

    // Не-Veo (kling, hailuo, wan, grok): jobs/createTask + jobs/recordInfo
    const inputPayload = buildJobsCreateTaskInput(model, imageUrl, videoPrompt);
    const createRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: inputPayload,
      }),
    });

    let createData: { data?: { taskId?: string; creditsUsed?: number }; message?: string; msg?: string; code?: number } = {};
    try {
      createData = await createRes.json();
    } catch (e) {
      const endTs = Date.now();
      console.error('[generate-video] jobs/createTask', { model, startTs, endTs, durationMs: endTs - startTs, httpStatus: createRes.status, error: 'response not JSON' });
      return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
    }

    const endTs = Date.now();
    const creditsUsed = createData?.data?.creditsUsed;
    console.error('[generate-video] jobs/createTask', { model, startTs, endTs, durationMs: endTs - startTs, httpStatus: createRes.status, creditsUsed, ...(createData?.msg ? { msg: createData.msg } : {}) });

    if (!createRes.ok || (createData.code !== undefined && createData.code !== 200)) {
      return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
    }

    const taskId = createData?.data?.taskId;
    if (!taskId) {
      return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
    }

    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const jobRes = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      let jobData: { data?: { state?: string; resultJson?: string; failMsg?: string }; message?: string } = {};
      try {
        jobData = await jobRes.json();
      } catch {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }
      if (!jobRes.ok) {
        const totalMs = Date.now() - startTs;
        console.error('[generate-video] jobs/recordInfo', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: jobRes.status });
        return res.status(502).json({ error: 'Не удалось получить видео. Попробуйте позже.' });
      }

      const state = jobData?.data?.state;
      if (state === 'success') {
        let videoUrl: string | undefined;
        const resultJson = jobData?.data?.resultJson;
        if (typeof resultJson === 'string') {
          try {
            const parsed = JSON.parse(resultJson) as Record<string, unknown>;
            videoUrl = extractVideoUrl(parsed);
            if (!videoUrl && Array.isArray(parsed?.result_urls)) videoUrl = (parsed.result_urls as string[])[0];
            if (!videoUrl && Array.isArray(parsed?.resultUrls)) videoUrl = (parsed.resultUrls as string[])[0];
          } catch {
            // ignore
          }
        }
        if (videoUrl) {
          const totalMs = Date.now() - startTs;
          console.error('[generate-video] success', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 200 });
          return res.status(200).json({ videoUrl });
        }
        const totalMs = Date.now() - startTs;
        console.error('[generate-video] success but no videoUrl in resultJson', { model, startTs, endTs: Date.now(), durationMs: totalMs });
        return res.status(500).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
      }
      if (state === 'fail') {
        const totalMs = Date.now() - startTs;
        console.error('[generate-video] fail', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 422, errorMessage: jobData?.data?.failMsg });
        return res.status(422).json({
          error: 'Генерация видео не удалась. Попробуйте снова.',
        });
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    const totalMs = Date.now() - startTs;
    console.error('[generate-video] timeout', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 408 });
    return res.status(408).json({
      error: 'Превышено время ожидания для видео. Попробуйте ещё раз.',
    });
  } catch (err: unknown) {
    const totalMs = Date.now() - startTs;
    console.error('[generate-video] error', { model: body?.model ?? DEFAULT_VIDEO_MODEL, startTs, endTs: Date.now(), durationMs: totalMs, errorMessage: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }
}
