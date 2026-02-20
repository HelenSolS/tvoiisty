/**
 * Backend-эндпоинт: примерка (try-on) через KIE.
 * Ключ KIE читается только здесь (process.env.KIE_API_KEY), на фронт не передаётся.
 * Один запрос = один вызов KIE: createTask (flux2) + опрос до готовности → возврат URL картинки.
 */

// Эндпоинт Vercel Serverless: (req, res) — типы через any, чтобы не тянуть @vercel/node
const KIE_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 60; // ~2 минуты макс
const MODEL_IMAGE = 'flux2'; // модель примерки, как в задании

export default async function handler(req: { method?: string; body?: Record<string, unknown> }, res: { status: (n: number) => { json: (o: object) => void } }) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'KIE_API_KEY не задан на сервере' });
  }

  try {
    const { personImageBase64, clothingImageBase64, prompt } = (req.body || {}) as {
      personImageBase64?: string;
      clothingImageBase64?: string;
      prompt?: string;
    };

    if (!personImageBase64 || !clothingImageBase64) {
      return res.status(400).json({ error: 'Нужны personImageBase64 и clothingImageBase64' });
    }

    // 1) Создать задачу в KIE (flux2)
    const createRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_IMAGE,
        input: {
          prompt: prompt || 'Virtual try-on: show this person wearing this clothing naturally',
          image_urls: [personImageBase64, clothingImageBase64],
        },
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      return res.status(createRes.status).json({
        error: createData?.message || 'Ошибка KIE при создании задачи',
      });
    }

    const taskId = createData?.data?.taskId;
    if (!taskId) {
      return res.status(500).json({ error: 'KIE не вернул taskId' });
    }

    // 2) Опрос результата: KIE — GET jobs/recordInfo?taskId=..., state: success|fail, resultJson с resultUrls
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const jobRes = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const jobData = await jobRes.json();

      if (!jobRes.ok) {
        return res.status(jobRes.status).json({
          error: jobData?.message || 'Ошибка при получении результата',
        });
      }

      const state = jobData?.data?.state;
      if (state === 'success') {
        let imageUrl: string | undefined;
        try {
          const resultJson = jobData?.data?.resultJson;
          if (typeof resultJson === 'string') {
            const parsed = JSON.parse(resultJson) as { resultUrls?: string[] };
            imageUrl = Array.isArray(parsed?.resultUrls) ? parsed.resultUrls[0] : undefined;
          }
        } catch {
          // ignore
        }
        if (imageUrl) return res.status(200).json({ imageUrl });
        return res.status(500).json({ error: 'Результат без URL изображения' });
      }
      if (state === 'fail') {
        return res.status(422).json({
          error: jobData?.data?.failMsg || 'Генерация не удалась. Попробуйте снова.',
        });
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    return res.status(408).json({
      error: 'Превышено время ожидания. Попробуйте ещё раз.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка сервера';
    return res.status(500).json({ error: message });
  }
}
