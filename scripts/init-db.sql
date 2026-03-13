-- Схема БД для твоИИстиль (PostgreSQL).
-- Порядок важен: users → media_assets → looks, ai_analyses, tryon_sessions → token_transactions, user_liked_looks, app_settings, ai_generation_logs.
-- Запуск: psql -U tvoiisty -d tvoiisty_db -f scripts/init-db.sql
-- Или при пустой БД просто запусти backend — он создаст таблицы сам (ensure* в server.ts).

BEGIN;

-- 1. Пользователи (auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'client',
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Медиа и LLM-анализы
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  original_url TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  hash TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_hash_type_idx ON media_assets(hash, type);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL,
  status TEXT NOT NULL,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Образы магазинов и лайки
CREATE TABLE IF NOT EXISTS looks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  main_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  scene_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  likes_count INT NOT NULL DEFAULT 0,
  tryon_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_liked_looks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  look_id UUID NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, look_id)
);

-- 4. Сессии примерки
CREATE TABLE IF NOT EXISTS tryon_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  person_asset_id UUID REFERENCES media_assets(id),
  look_id UUID REFERENCES looks(id),
  result_image_asset_id UUID REFERENCES media_assets(id),
  result_video_asset_id UUID REFERENCES media_assets(id),
  provider TEXT,
  model_name TEXT,
  scene_type TEXT,
  status TEXT CHECK (status IN ('pending','processing','completed','failed','cancelled')) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  client_request_id TEXT,
  tokens_charged INT DEFAULT 0,
  source TEXT,
  request_meta JSONB,
  result_meta JSONB,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tryon_user_created ON tryon_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tryon_look_created ON tryon_sessions(look_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tryon_status ON tryon_sessions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tryon_user_client_req ON tryon_sessions(user_id, client_request_id);

-- 5. Токены
CREATE TABLE IF NOT EXISTS token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tryon_session_id UUID REFERENCES tryon_sessions(id) ON DELETE SET NULL,
  amount INT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_tx_user_created ON token_transactions(user_id, created_at DESC);

-- 6. Глобальные настройки
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO app_settings (key, value) VALUES
  ('INITIAL_TOKENS', '10'),
  ('FREE_DAILY_IMAGES', '3'),
  ('FREE_DAILY_VIDEOS', '1'),
  ('TOKENS_PER_IMAGE', '1'),
  ('TOKENS_PER_VIDEO', '5'),
  ('DEFAULT_IMAGE_MODEL', '"nano-banana-pro"'),
  ('DEFAULT_VIDEO_MODEL', '"hailuo-02"'),
  ('ENABLED_IMAGE_PROVIDER', '"fal"'),
  ('ENABLED_VIDEO_PROVIDER', '"fal"'),
  ('TRYON_RESULT_TTL_DAYS', '7')
ON CONFLICT (key) DO NOTHING;

-- 7. Логи генераций
CREATE TABLE IF NOT EXISTS ai_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  duration_ms INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;
