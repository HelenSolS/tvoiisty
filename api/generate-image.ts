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
    console.error('[generate-image] KIE_API_KEY not set in environment');
    return res.status(500).json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }

  try {
    const { personImageBase64, clothingImageBase64, prompt } = (req.body || {}) as {
      personImageBase64?: string;
      clothingImageBase64?: string;
      prompt?: string;
    };

    if (!personImageBase64 || !clothingImageBase64) {
      return res.status(400).json({ error: 'Недостаточно данных для примерки.' });
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

    let createData: { data?: { taskId?: string }; message?: string; msg?: string } = {};
    try {
      createData = await createRes.json();
    } catch (e) {
      console.error('[generate-image] createTask response not JSON', e);
      return res.status(502).json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }
    if (!createRes.ok) {
      console.error('[generate-image] createTask HTTP', createRes.status, createData);
      return res.status(502).json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }
    const code = (createData as { code?: number }).code;
    if (code !== undefined && code !== 200) {
      console.error('[generate-image] createTask body code', code, createData?.msg || createData?.message);
      return res.status(502).json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    const taskId = createData?.data?.taskId;
    if (!taskId) {
      console.error('[generate-image] createTask no taskId in response', createData);
      return res.status(502).json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    // 2) Опрос результата: KIE — GET jobs/recordInfo?taskId=..., state: success|fail, resultJson с resultUrls
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const jobRes = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      let jobData: { data?: { state?: string; resultJson?: string; failMsg?: string }; message?: string } = {};
      try {
        jobData = await jobRes.json();
      } catch {
        continue; // повторить опрос
      }
      if (!jobRes.ok) {
        console.error('[generate-image] recordInfo HTTP', jobRes.status, jobData);
        return res.status(502).json({ error: 'Не удалось получить результат. Попробуйте позже.' });
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
        console.error('[generate-image] success state but no imageUrl in resultJson', jobData?.data);
        return res.status(500).json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
      }
      if (state === 'fail') {
        console.error('[generate-image] job state=fail', jobData?.data?.failMsg);
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
    console.error('[generate-image]', err);
    return res.status(500).json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }
}
