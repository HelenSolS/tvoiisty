import { describe, it, beforeAll, beforeEach, expect, vi } from 'vitest';
import { pool } from '../../backend/db.js';
import { ensureMediaTables } from '../../backend/media.js';
import {
  enqueuePhotoAnalysis,
  getExistingSuccessfulAnalysis,
} from '../../backend/aiPhotoPipeline.js';

const { callChatMock } = vi.hoisted(() => ({ callChatMock: vi.fn() }));

vi.mock('../../backend/openrouter.js', async (orig) => {
  const actual = await orig<typeof import('../../backend/openrouter.js')>();
  return {
    ...actual,
    callChat: callChatMock,
  };
});

describe('Issue 39 – AI Photo LLM Pipeline (ai_analyses cache + logging)', () => {
  beforeAll(async () => {
    await ensureMediaTables();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM ai_analyses');
    await pool.query('DELETE FROM media_assets');
    callChatMock.mockReset();
  });

  it('returns existing successful analysis from cache', async () => {
    const assetRes = await pool.query<{
      id: string;
    }>(
      `INSERT INTO media_assets (type, original_url, storage_key, hash)
       VALUES ('person', 'https://example.com/p.png', 'media/person/p.png', 'hash123')
       RETURNING id`,
    );
    const assetId = assetRes.rows[0].id;

    await pool.query(
      `INSERT INTO ai_analyses (asset_id, analysis_type, status, result)
       VALUES ($1, 'photo_llm_v1', 'success', '{"ok":true}'::jsonb)`,
      [assetId],
    );

    const result = await getExistingSuccessfulAnalysis(assetId, 'photo_llm_v1');
    expect(result).toEqual({ ok: true });
  });

  it('runs analysis via LLM and stores result when no cache exists', async () => {
    const assetRes = await pool.query<{ id: string }>(
      `INSERT INTO media_assets (type, original_url, storage_key, hash)
       VALUES ('clothing', 'https://example.com/c.png', 'media/clothing/c.png', 'hash456')
       RETURNING id`,
    );
    const assetId = assetRes.rows[0].id;

    callChatMock.mockResolvedValue(
      JSON.stringify({
        moderation: { safe: true, reasons: [] },
        description: 'Test description',
        metadata: { tags: ['tag1'], scene: 'studio' },
      }),
    );

    enqueuePhotoAnalysis({
      assetId,
      type: 'clothing',
      analysisType: 'photo_llm_v1',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(callChatMock).toHaveBeenCalledTimes(1);

    const res = await pool.query<{
      status: string;
      result: any;
    }>(
      `SELECT status, result
       FROM ai_analyses
       WHERE asset_id = $1 AND analysis_type = 'photo_llm_v1'
       LIMIT 1`,
      [assetId],
    );

    expect(res.rowCount).toBe(1);
    expect(res.rows[0].status).toBe('success');
    expect(res.rows[0].result).toMatchObject({
      moderation: { safe: true },
      description: 'Test description',
    });
  });

  it('does not re-run analysis when successful result already exists (cache hit)', async () => {
    const assetRes = await pool.query<{ id: string }>(
      `INSERT INTO media_assets (type, original_url, storage_key, hash)
       VALUES ('location', 'https://example.com/l.png', 'media/location/l.png', 'hash789')
       RETURNING id`,
    );
    const assetId = assetRes.rows[0].id;

    await pool.query(
      `INSERT INTO ai_analyses (asset_id, analysis_type, status, result)
       VALUES ($1, 'photo_llm_v1', 'success', '{"cached":true}'::jsonb)`,
      [assetId],
    );

    enqueuePhotoAnalysis({
      assetId,
      type: 'location',
      analysisType: 'photo_llm_v1',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(callChatMock).not.toHaveBeenCalled();

    const res = await pool.query<{
      status: string;
      result: any;
    }>(
      `SELECT status, result
       FROM ai_analyses
       WHERE asset_id = $1 AND analysis_type = 'photo_llm_v1'
       LIMIT 1`,
      [assetId],
    );

    expect(res.rowCount).toBe(1);
    expect(res.rows[0].status).toBe('success');
    expect(res.rows[0].result).toEqual({ cached: true });
  });
});

