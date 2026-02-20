/**
 * Backend-эндпоинт: примерка (try-on) через KIE.
 * Ключ KIE читается только здесь (process.env.KIE_API_KEY), на фронт не передаётся.
 * Один запрос = один вызов KIE: createTask (модель из KIE_IMAGE_MODEL) + опрос до готовности → возврат URL картинки.
 */

const KIE_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 60; // ~2 минуты макс

// Модель примерки: можно переопределить в env, но по умолчанию ставим ту,
// которая точно работает: flux-2/flex-image-to-image
const MODEL_IMAGE =
  process.env.KIE_IMAGE_MODEL || 'flux-2/flex-image-to-image';

// Эндпоинт Vercel Serverless: (req, res) — типы через any, чтобы не тянуть @vercel/node
export default async function handler(
  req: { method?: string; body?: Record<string, unknown> },
  res: { status: (n: number) => { json: (o: object) => void } },
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    console.error('[generate-image] KIE_API_KEY not set in environment');
    return res
      .status(500)
      .json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }

  try {
    const { personImageBase64, clothingImageBase64, prompt } = (req.body ||
      {}) as {
      personImageBase64?: string;
      clothingImageBase64?: string;
      prompt?: string;
    };

    if (!personImageBase64 || !clothingImageBase64) {
      return res
        .status(400)
        .json({ error: 'Недостаточно данных для примерки.' });
    }

    // 1) Создать задачу в KIE (jobs/createTask)
    const createRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // ВАЖНО: корректное имя модели
        model: MODEL_IMAGE,
        // ВАЖНО: input — СТРОКА (JSON внутри JSON), как в твоём успешном запросе
        input: JSON.stringify({
          aspect_ratio: '1:1',
          resolution: '1K',
          prompt:
            prompt ||
            'Virtual try-on: dress the person in the outfit from the second image naturally.',
          // KIE ждёт input_urls, а не image_urls.
          // ВНИМАНИЕ: здесь должны быть URL, как в логах с tempfile.redpandaai.
          input_urls: [personImageBase64, clothingImageBase64],
        }),
      }),
    });

    let createData: {
      data?: { taskId?: string };
      message?: string;
      msg?: string;
      code?: number;
    } = {};
    try {
      createData = (await createRes.json()) as typeof createData;
    } catch (e) {
      console.error('[generate-image] createTask response not JSON', e);
      return res
        .status(502)
        .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    if (!createRes.ok) {
      console.error(
        '[generate-image] createTask HTTP',
        createRes.status,
        createData,
      );
      return res
        .status(502)
        .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    const code = createData.code;
    if (code !== undefined && code !== 200) {
      console.error(
        '[generate-image] createTask body code',
        code,
        createData?.msg || createData?.message,
      );
      return res
        .status(502)
        .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    const taskId = createData?.data?.taskId;
    if (!taskId) {
      console.error(
        '[generate-image] createTask no taskId in response',
        createData,
      );
      return res
        .status(502)
        .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    // 2) Опрос результата: KIE — GET jobs/recordInfo?taskId=..., state: success|fail, resultJson с resultUrls
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const jobRes = await fetch(
        `${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );

      let jobData: {
        data?: { state?: string; resultJson?: string; failMsg?: string };
        message?: string;
      } = {};
      try {
        jobData = (await jobRes.json()) as typeof jobData;
      } catch {
        // ответ не JSON — подождём ещё немного
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      if (!jobRes.ok) {
        console.error(
          '[generate-image] recordInfo HTTP',
          jobRes.status,
          jobData,
        );
        return res
          .status(502)
          .json({ error: 'Не удалось получить результат. Попробуйте позже.' });
      }

      const state = jobData?.data?.state;
      if (state === 'success') {
        let imageUrl: string | undefined;
        try {
          const resultJson = jobData?.data?.resultJson;
          if (typeof resultJson === 'string') {
            const parsed = JSON.parse(resultJson) as {
              resultUrls?: string[];
            };
            imageUrl = Array.isArray(parsed?.resultUrls)
              ? parsed.resultUrls[0]
              : undefined;
          }
        } catch {
          // игнорируем, упадём в лог ниже
        }

        if (imageUrl) {
          return res.status(200).json({ imageUrl });
        }

        console.error(
          '[generate-image] success state but no imageUrl in resultJson',
          jobData?.data,
        );
        return res
          .status(500)
          .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
      }

      if (state === 'fail') {
        console.error(
          '[generate-image] job state=fail',
          jobData?.data?.failMsg,
        );
        return res.status(422).json({
          error:
            jobData?.data?.failMsg ||
            'Генерация не удалась. Попробуйте снова.',
        });
      }

      // пока state не success/fail — ждём
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    return res.status(408).json({
      error: 'Превышено время ожидания. Попробуйте ещё раз.',
    });
  } catch (err: unknown) {
    console.error('[generate-image]', err);
    return res
      .status(500)
      .json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }
}
