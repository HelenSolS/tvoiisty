/**
 * Схема JSON от OpenAI Vision (анализ одежды).
 * Issue #12 — AI Core Refactor. См. docs/issue-12-ai-core-refactor-spec.md
 */

import { z } from 'zod';

export const garmentDescriptionSchema = z.object({
  garment_type: z.string().min(1, 'garment_type is required'),
  dominant_color: z.string().min(1, 'dominant_color is required'),
  material: z.string().min(1, 'material is required'),
  fit: z.string().min(1, 'fit is required'),
  sleeves: z.string().min(1, 'sleeves is required'),
  length: z.string().min(1, 'length is required'),
  style: z.string().min(1, 'style is required'),
  details: z.string().min(1, 'details is required'),
});

export type GarmentDescription = z.infer<typeof garmentDescriptionSchema>;

/**
 * Безопасный парсер ответа Vision.
 * Возвращает null при невалидном JSON — для retry/fallback в prepare-tryon-prompt.
 */
export function tryParseGarmentDescription(raw: unknown): GarmentDescription | null {
  const result = garmentDescriptionSchema.safeParse(raw);
  return result.success ? result.data : null;
}
