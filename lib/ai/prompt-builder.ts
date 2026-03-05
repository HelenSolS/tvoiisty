import type { SceneType } from './scenes.config';

/** Ядро промпта: фиксированный anchor для лица и одежды. */
const CORE_PROMPT = `
Use the provided person image as the exact identity reference.
Preserve the face exactly as in the photo.
Preserve facial structure, eyes, nose, jawline, skin texture and hairstyle.

Use the provided clothing image as the exact outfit reference.
Preserve the outfit exactly: color, design, fabric, cut, proportions and details.

Do not change the person's identity.
Do not modify the outfit.
Do not stylize the face.
Do not change body shape.

Only change environment, atmosphere, lighting and camera composition.

The person must look natural and realistic.
Full body visible.
Natural posture.
Premium fashion photography style.
`.trim();

/** Киношный слой: делает кадр более похожим на editorial fashion-съёмку. */
const CINEMA_BLOCK = `
cinematic lighting
natural skin texture
premium editorial fashion photography
soft depth of field
high detail
clean composition
luxury magazine look
professional fashion photoshoot
natural colors
`.trim();

/** Набор сценариев по типам локаций. Берём случайную сцену из пула. */
const SCENE_POOLS: Record<'minimal' | 'sea' | 'sport' | 'city' | 'nature', string[]> = {
  minimal: [
    'modern architectural concrete space',
    'clean white gallery interior',
    'luxury minimalist penthouse',
    'soft neutral studio backdrop',
    'high-end showroom interior',
    'modern glass architecture space',
    'design museum hall',
    'bright Scandinavian interior',
  ],
  sea: [
    'sunset ocean shore with golden light',
    'rocky coastline with waves',
    'luxury yacht deck',
    'tropical beach with soft wind',
    'coastal promenade',
    'cliffs above the ocean',
    'seaside wooden pier',
    'Mediterranean harbor street',
  ],
  sport: [
    'modern gym with dramatic lighting',
    'sunrise mountain trail with fresh air',
    'urban rooftop workout space',
    'minimalist indoor training studio',
    'forest running trail with morning mist',
    'sports stadium training field',
    'coastal jogging path near the ocean',
    'rocky canyon training landscape',
  ],
  city: [
    'modern downtown street',
    'glass skyscraper district',
    'evening city lights boulevard',
    'fashion district street',
    'urban bridge walkway',
    'historic european street',
    'night neon city street',
    'luxury shopping avenue',
  ],
  nature: [
    'forest clearing with sun rays',
    'mountain valley landscape',
    'wild meadow with wind',
    'desert sand dunes',
    'alpine lake shore',
    'rocky canyon trail',
    'autumn forest path',
    'northern lake landscape',
  ],
};

/** Разные ракурсы камеры для небольшого разнообразия кадров. */
const CAMERA_ANGLES = [
  'full body fashion shot',
  'wide cinematic shot',
  'low angle fashion shot',
  'walking lifestyle shot',
  'editorial standing pose',
  'dynamic walking pose',
];

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Строит промпт для примерки по выбранной локации. */
export function buildPrompt(sceneType: SceneType = 'minimal'): string {
  // Бизнес/ивент ближе всего к городскому контексту.
  const poolKey: 'minimal' | 'sea' | 'sport' | 'city' | 'nature' =
    sceneType === 'sea'
      ? 'sea'
      : sceneType === 'sport'
      ? 'sport'
      : sceneType === 'minimal'
      ? 'minimal'
      : 'city';

  const scenes = SCENE_POOLS[poolKey] || SCENE_POOLS.minimal;
  const scene = pickRandom(scenes);
  const camera = pickRandom(CAMERA_ANGLES);

  const parts = [
    CORE_PROMPT,
    `Environment: ${scene}.`,
    `Camera angle: ${camera}.`,
    CINEMA_BLOCK,
  ];

  return parts.join('\n\n').trim();
}

export type { SceneType };

