/**
 * Backend-эндпоинт: генерация видео из результата примерки через KIE.
 * Ключ только на бэкенде (process.env.KIE_API_KEY).
 * Один запрос = один вызов KIE (видео-модель: Minimax / Hailuo / и т.д. — см. MODEL_VIDEO).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Req = { method?: string; body?: Record<string, unknown> };
type Res = { status: (n: number) => { json: (o: object) => void } };

const KIE_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 80; // до ~4 минут для видео
// Модель видео в KIE — при необходимости замени на актуальную (minimax, hailuo, veo, grok и т.д.)
const MODEL_VIDEO = 'minimax'; // первый провайдер по заданию; если у KIE другое имя — поменять

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'KIE_API_KEY не задан на сервере' });
  }

  try {
    const { imageUrl } = (req.body || {}) as { imageUrl?: string };
    if (!imageUrl) {
      return res.status(400).json({ error: 'Нужен imageUrl (результат примерки)' });
    }

    // 1) Создать задачу на генерацию видео (image-to-video)
    const createRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_VIDEO,
        input: {
          image_url: imageUrl,
          prompt: 'Short fashion clip, person wearing the outfit, subtle motion.',
        },
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      return res.status(createRes.status).json({
        error: createData?.message || 'Ошибка KIE при создании видео-задачи',
      });
    }

    const taskId = createData?.data?.taskId;
    if (!taskId) {
      return res.status(500).json({ error: 'KIE не вернул taskId для видео' });
    }

    // 2) Опрос до готовности: KIE jobs/recordInfo, state: success|fail, resultJson.resultUrls
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const jobRes = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const jobData = await jobRes.json();

      if (!jobRes.ok) {
        return res.status(jobRes.status).json({
          error: jobData?.message || 'Ошибка при получении видео',
        });
      }

      const state = jobData?.data?.state;
      if (state === 'success') {
        let videoUrl: string | undefined;
        try {
          const resultJson = jobData?.data?.resultJson;
          if (typeof resultJson === 'string') {
            const parsed = JSON.parse(resultJson) as { resultUrls?: string[] };
            videoUrl = Array.isArray(parsed?.resultUrls) ? parsed.resultUrls[0] : undefined;
          }
        } catch {
          // ignore
        }
        if (videoUrl) return res.status(200).json({ videoUrl });
        return res.status(500).json({ error: 'Результат без URL видео' });
      }
      if (state === 'fail') {
        return res.status(422).json({
          error: jobData?.data?.failMsg || 'Генерация видео не удалась. Попробуйте снова.',
        });
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    return res.status(408).json({
      error: 'Превышено время ожидания для видео. Попробуйте ещё раз.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка сервера';
    return res.status(500).json({ error: message });
  }
}
