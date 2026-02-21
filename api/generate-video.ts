/**
 * Backend-эндпоинт: генерация видео из результата примерки через KIE Veo.
 * Тот же префикс, что и для картинки: https://api.kie.ai/api/v1/... (veo/generate, veo/record-info).
 * Ключ только на бэкенде (process.env.KIE_API_KEY).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Req = { method?: string; body?: Record<string, unknown> };
type Res = { status: (n: number) => { json: (o: object) => void } };

const DEFAULT_KIE_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 3000;

type ProviderId = 'default' | 'backup';

function getKieConfig(provider: ProviderId): { base: string; apiKey: string | undefined } {
  if (provider === 'backup') {
    const base = process.env.KIE_BACKUP_BASE_URL;
    const apiKey = process.env.KIE_BACKUP_API_KEY;
    if (base && apiKey) return { base: base.replace(/\/$/, ''), apiKey };
  }
  return {
    base: (process.env.KIE_BASE_URL || DEFAULT_KIE_BASE).replace(/\/$/, ''),
    apiKey: process.env.KIE_API_KEY,
  };
}
const POLL_MAX_ATTEMPTS = 80;

/** Промпт по умолчанию для видео (позже — выбор из набора для разнообразия). */
const DEFAULT_VIDEO_PROMPT = `Create a short high-end fashion advertisement video based on the provided image.

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

  const provider = (req.body?.provider === 'backup' ? 'backup' : 'default') as ProviderId;
  const { base: KIE_BASE, apiKey } = getKieConfig(provider);
  if (!apiKey) {
    console.error('[generate-video] API key not set for provider', provider);
    return res.status(500).json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }
  console.error('[generate-video] provider', provider);

  try {
    const { imageUrl, prompt } = (req.body || {}) as { imageUrl?: string; prompt?: string };
    if (!imageUrl) {
      return res.status(400).json({ error: 'Недостаточно данных для создания видео.' });
    }

    // 1) Veo: POST veo/generate (как в backend/kieClient)
    const createRes = await fetch(`${KIE_BASE}/veo/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt || DEFAULT_VIDEO_PROMPT,
        model: 'veo3',
        aspect_ratio: '9:16',
        imageUrls: [imageUrl],
      }),
    });

    let createData: { data?: { taskId?: string }; message?: string; msg?: string } = {};
    try {
      createData = await createRes.json();
    } catch (e) {
      console.error('[generate-video] veo/generate response not JSON', e);
      return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
    }
    if (!createRes.ok) {
      console.error('[generate-video] veo/generate HTTP', createRes.status, createData);
      return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
    }

    const taskId = createData?.data?.taskId;
    if (!taskId) {
      console.error('[generate-video] veo/generate no taskId', createData);
      return res.status(502).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
    }

    // 2) Опрос: GET veo/record-info?taskId= (successFlag 0=generating, 1=success, 2/3=fail)
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
        console.error('[generate-video] veo/record-info HTTP', jobRes.status, jobData);
        return res.status(502).json({ error: 'Не удалось получить видео. Попробуйте позже.' });
      }

      const flag = jobData?.data?.successFlag;
      if (flag === 1 || flag === '1') {
        const videoUrl = extractVideoUrl(jobData?.data);
        if (videoUrl) return res.status(200).json({ videoUrl });
        console.error('[generate-video] successFlag=1 but no videoUrl', jobData?.data);
        return res.status(500).json({ error: 'Не удалось создать видео. Попробуйте позже.' });
      }
      if (flag === 2 || flag === 3 || flag === '2' || flag === '3') {
        console.error('[generate-video] veo successFlag fail', flag);
        return res.status(422).json({
          error: 'Генерация видео не удалась. Попробуйте снова.',
        });
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    return res.status(408).json({
      error: 'Превышено время ожидания для видео. Попробуйте ещё раз.',
    });
  } catch (err: unknown) {
    console.error('[generate-video]', err);
    return res.status(500).json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }
}
