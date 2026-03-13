const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CallChatOptions {
  model?: string;
  fallbackModels?: string[];
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';
const DEFAULT_TEMPERATURE = 0.4;

/**
 * Базовый список fallback-моделей. Можно переопределить через options.fallbackModels.
 */
const DEFAULT_FALLBACK_MODELS: string[] = [
  'mistralai/mistral-small',
  'meta-llama/llama-3.1-8b-instruct',
];

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      '[openrouter] OPENROUTER_API_KEY is not set. Configure it in environment variables.',
    );
  }
  return key.trim();
}

/**
 * Централизованный вызов OpenRouter chat API с поддержкой fallback моделей.
 * Не привязан к конкретному сценарию — может использоваться для анализа изображений,
 * генерации описаний, summary и любых других LLM-задач.
 */
export async function callChat(
  messages: ChatMessage[],
  options: CallChatOptions = {},
): Promise<string> {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('[openrouter] messages must be a non-empty array');
  }

  const apiKey = getApiKey();
  const baseModel = (options.model || DEFAULT_MODEL).trim();
  const fallbacks =
    options.fallbackModels && options.fallbackModels.length > 0
      ? options.fallbackModels
      : DEFAULT_FALLBACK_MODELS;

  const body: Record<string, unknown> = {
    model: baseModel,
    messages,
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
  };

  if (options.maxTokens) {
    body.max_tokens = options.maxTokens;
  }

  // Fallback-модели: OpenRouter позволяет указать массив моделей в extra_body.models.
  if (fallbacks.length > 0) {
    body.extra_body = {
      models: [baseModel, ...fallbacks],
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    // Эти два заголовка рекомендуются OpenRouter для статистики и приоритизации.
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://tvoi.sty',
    'X-Title': 'Tvoisty AI Service',
  };

  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as any;

  if (!res.ok) {
    const message =
      json?.error?.message ||
      json?.message ||
      `[openrouter] HTTP ${res.status} ${res.statusText}`;
    throw new Error(message);
  }

  const content: string | undefined =
    json?.choices?.[0]?.message?.content ??
    (Array.isArray(json?.choices?.[0]?.message?.content)
      ? json.choices[0].message.content
          .map((part: any) => part?.text || part?.content || '')
          .join('')
      : undefined);

  if (!content) {
    throw new Error('[openrouter] Empty response content from OpenRouter');
  }

  return content;
}

