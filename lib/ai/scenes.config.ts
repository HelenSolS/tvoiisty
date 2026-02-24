export type SceneType = 'minimal' | 'sea' | 'business' | 'event' | 'sport';

export interface SceneConfig {
  id: SceneType;
  label: string;
  background: string;
  mood: string;
}

export const SCENES: SceneConfig[] = [
  {
    id: 'minimal',
    label: 'Минимализм',
    background: 'soft beige-gray or light concrete, clean and distraction-free.',
    mood: 'premium, confident, modern.',
  },
  {
    id: 'sea',
    label: 'Отдых у моря',
    background: 'sunny beach, ocean horizon, soft sand, natural golden light.',
    mood: 'fresh, relaxed, elegant summer fashion.',
  },
  {
    id: 'business',
    label: 'Деловое',
    background:
      'modern office interior, glass walls, city skyline, neutral professional environment.',
    mood: 'confident, ambitious, executive style.',
  },
  {
    id: 'event',
    label: 'Нарядное событие',
    background:
      'elegant theater or evening event setting, soft spotlight, subtle bokeh lights.',
    mood: 'luxury, refined, sophisticated.',
  },
  {
    id: 'sport',
    label: 'Спорт',
    background: 'outdoor park or modern gym interior, dynamic natural light.',
    mood: 'energetic, active, fresh.',
  },
];

