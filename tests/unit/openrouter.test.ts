import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callChat, type ChatMessage } from '../../backend/openrouter.js';

const ORIGINAL_ENV = { ...process.env };

describe('OpenRouter callChat()', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, OPENROUTER_API_KEY: 'test-openrouter-key' };
    // @ts-expect-error global fetch in node test env
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it('calls OpenRouter with default model and fallback models on happy path', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a test LLM.' },
      { role: 'user', content: 'Hello' },
    ];

    const fakeResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'Hi from model' } }],
      }),
    };

    // @ts-expect-error mocked fetch
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fakeResponse);

    const result = await callChat(messages, {});

    expect(result).toBe('Hi from model');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('google/gemini-2.5-flash-lite');
    expect(body.messages).toEqual(messages);
    expect(body.temperature).toBeDefined();
    expect(body.extra_body.models).toContain('mistralai/mistral-small');
  });

  it('allows overriding model and fallbackModels', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hi' },
    ];

    const fakeResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'Override' } }],
      }),
    };

    // @ts-expect-error mocked fetch
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fakeResponse);

    await callChat(messages, {
      model: 'custom/model',
      fallbackModels: ['fallback-1', 'fallback-2'],
      temperature: 0.1,
      maxTokens: 128,
    });

    const [, init] = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('custom/model');
    expect(body.extra_body.models).toEqual(['custom/model', 'fallback-1', 'fallback-2']);
    expect(body.max_tokens).toBe(128);
  });

  it('throws if messages array is empty', async () => {
    await expect(callChat([])).rejects.toThrow(/messages must be a non-empty array/);
  });

  it('throws if OPENROUTER_API_KEY is not set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];

    await expect(callChat(messages)).rejects.toThrow(/OPENROUTER_API_KEY is not set/);
  });

  it('throws a helpful error when OpenRouter responds with non-2xx', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];

    const fakeResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: vi.fn().mockResolvedValue({
        error: { message: 'LLM backend failure' },
      }),
    };

    // @ts-expect-error mocked fetch
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fakeResponse);

    await expect(callChat(messages)).rejects.toThrow(/LLM backend failure/);
  });

  it('surfaces network/timeout errors from fetch', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];

    // @ts-expect-error mocked fetch
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network timeout'));

    await expect(callChat(messages)).rejects.toThrow(/network timeout/);
  });
});

