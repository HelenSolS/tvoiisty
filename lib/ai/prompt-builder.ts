import { SCENES, type SceneType } from './scenes.config';

const BASE_PROMPT =
  'Put the garment from the second image onto the person in the first image. Preserve character consistency, garment consistency, and body shape. Dress naturally, beautifully and stylishly this outfit from the photo. Style: hyper-realistic high-end fashion photography. Lighting: soft directional side light with subtle rim light. Composition: rule of thirds, subject centered, vertical frame. Camera: Sony A7R V, 85mm f/1.8. Format: vertical.';

export function buildPrompt(sceneType: SceneType = 'minimal'): string {
  const scene =
    SCENES.find((s) => s.id === sceneType) || SCENES.find((s) => s.id === 'minimal')!;
  return `${BASE_PROMPT} Background: ${scene.background} Mood: ${scene.mood}`.trim();
}

export type { SceneType };

