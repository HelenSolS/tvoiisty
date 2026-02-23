/**
 * Дополнительная панель настроек (провайдер, модели). Вход по паролю 888 — заглушка, авторизация позже.
 * Issue #29: опционально метрики и Reset Metrics для демо.
 */

import React, { useState, useEffect } from 'react';
import type { AdminSettings } from '../types';
import type { AppMetrics } from '../services/metricsStorage';
import {
  getAdminSettings,
  setAdminSettings,
  IMAGE_MODEL_POOL,
  VIDEO_MODEL_POOL,
  DEFAULT_ADMIN_SETTINGS,
} from '../services/adminSettings';

const ADMIN_PASSWORD = '888';

export const AdminPanel: React.FC<{
  onBack: () => void;
  unlocked: boolean;
  onUnlock: () => void;
  metrics?: AppMetrics | null;
  onResetMetrics?: () => Promise<void>;
}> = ({
  onBack,
  unlocked,
  onUnlock,
  metrics = null,
  onResetMetrics,
}) => {
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSettings>(DEFAULT_ADMIN_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (unlocked) setSettings(getAdminSettings());
  }, [unlocked]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setPasswordError(null);
      onUnlock();
      setSettings(getAdminSettings());
    } else {
      setPasswordError('Неверный пароль');
    }
  };

  const handleSave = () => {
    setAdminSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  /** Сброс в стабильное состояние для показа: Fal Banana (картинка), Kling (видео), без выбора на главном. Сразу сохраняем. */
  const handleRestoreStability = () => {
    const stable: AdminSettings = {
      ...DEFAULT_ADMIN_SETTINGS,
      imageModelsInDropdown: [...DEFAULT_ADMIN_SETTINGS.imageModelsInDropdown],
      videoModelsInDropdown: [...DEFAULT_ADMIN_SETTINGS.videoModelsInDropdown],
    };
    setSettings(stable);
    setAdminSettings(stable);
    setRestored(true);
    setTimeout(() => setRestored(false), 2500);
  };

  const toggleImageModelInDropdown = (model: string) => {
    const next = settings.imageModelsInDropdown.includes(model)
      ? settings.imageModelsInDropdown.filter((m) => m !== model)
      : [...settings.imageModelsInDropdown, model];
    setSettings((s) => ({ ...s, imageModelsInDropdown: next }));
  };

  const toggleVideoModelInDropdown = (model: string) => {
    const next = settings.videoModelsInDropdown.includes(model)
      ? settings.videoModelsInDropdown.filter((m) => m !== model)
      : [...settings.videoModelsInDropdown, model];
    setSettings((s) => ({ ...s, videoModelsInDropdown: next }));
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex flex-col">
        <button onClick={onBack} className="self-start py-2 px-4 text-[10px] font-black uppercase tracking-widest text-gray-500">
          ← Назад
        </button>
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto">
          <h2 className="serif text-2xl font-black italic text-gray-900 mb-6">Дополнительные настройки</h2>
          <form onSubmit={handlePasswordSubmit} className="w-full space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
              placeholder="Пароль"
              className="w-full py-4 px-5 rounded-2xl border-2 border-gray-200 text-[11px] font-bold uppercase tracking-wide outline-none focus:border-theme"
              autoFocus
            />
            {passwordError && <p className="text-red-500 text-[10px] font-bold uppercase">{passwordError}</p>}
            <button type="submit" className="w-full py-5 bg-theme text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl">
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 pb-24">
      <div className="max-w-lg mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="py-2 px-4 text-[10px] font-black uppercase tracking-widest text-gray-500">
            ← Назад
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="py-2.5 px-5 min-w-[100px] bg-gray-800 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-gray-700 active:bg-gray-900"
          >
            {restored ? 'Стабильность восстановлена' : saved ? 'Сохранено' : 'Сохранить'}
          </button>
        </div>

        <h2 className="serif text-2xl font-black italic text-gray-900">Настройки</h2>

        {metrics !== undefined && metrics !== null && onResetMetrics && (
          <section className="p-5 rounded-2xl bg-white border border-gray-200 shadow-lg space-y-4">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-700">📊 Метрики (демо)</h3>
            <div className="grid grid-cols-2 gap-3 text-[10px]">
              <div className="bg-gray-50 p-3 rounded-xl text-center">
                <span className="text-lg font-black text-theme">{metrics.totalCollectionsCreated}</span>
                <p className="text-[8px] uppercase text-gray-500 mt-0.5">Коллекций</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-xl text-center">
                <span className="text-lg font-black text-theme">{metrics.totalOutfitsUploaded}</span>
                <p className="text-[8px] uppercase text-gray-500 mt-0.5">Образов загружено</p>
              </div>
              <div className="col-span-2 bg-gray-50 p-3 rounded-xl text-center">
                <span className="text-lg font-black text-theme">{metrics.totalTryOns + metrics.totalVideos + metrics.totalShares}</span>
                <p className="text-[8px] uppercase text-gray-500 mt-0.5">Общая активность (примерки + видео + шары)</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onResetMetrics()}
              className="w-full py-2.5 rounded-xl border-2 border-red-200 text-red-600 font-black text-[9px] uppercase tracking-widest hover:bg-red-50"
            >
              Reset Metrics
            </button>
          </section>
        )}

        <p className="text-[9px] text-gray-500 mb-4">Для пользователей без доступа в админку (пароль 888) действуют настройки по умолчанию: одна модель, без выбора. Ниже — настройки только для этого устройства (локально).</p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleRestoreStability}
            className="w-full py-3 px-4 rounded-xl border-2 border-theme bg-theme/10 text-theme font-black text-[10px] uppercase tracking-widest hover:bg-theme/20 active:bg-theme/30"
          >
            Вернуть стабильность
          </button>
          <p className="text-[8px] text-gray-400">Fal Banana (картинка), Kling (видео), без выбора на главном. Сразу сохраняет.</p>
        </div>

        {/* Локально: где показывать выбор моделей */}
        <section className="p-4 rounded-2xl bg-gray-100/80 border border-gray-200">
          <p className="text-[9px] font-black uppercase text-gray-500 mb-2">Локально (только это устройство)</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showModelChoiceOnHome === true}
              onChange={(e) => setSettings((s) => ({ ...s, showModelChoiceOnHome: e.target.checked }))}
              className="rounded border-2 border-theme text-theme"
            />
            <span className="text-[10px] font-bold">Показывать выбор моделей (фото и видео) на главном экране — для теста</span>
          </label>
          <p className="text-[8px] text-gray-400 mt-1.5">Выключено: выбор модели только в Дополнительных настройках.</p>
        </section>

        {/* Провайдер */}
        <section>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Провайдер (KIE / Fal)</p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                checked={settings.provider === 'kie'}
                onChange={() => setSettings((s) => ({ ...s, provider: 'kie' }))}
                className="rounded-full border-2 border-theme text-theme"
              />
              <span className="text-[11px] font-bold uppercase">KIE</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                checked={settings.provider === 'fal'}
                onChange={() => setSettings((s) => ({ ...s, provider: 'fal' }))}
                className="rounded-full border-2 border-theme text-theme"
              />
              <span className="text-[11px] font-bold uppercase">Fal</span>
            </label>
          </div>
        </section>

        {/* Картинки: по умолчанию и выпадающий список */}
        <section className="space-y-4">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-700">Картинки (примерка)</h3>
          <div>
            <p className="text-[9px] font-black uppercase text-gray-500 mb-1">Модель по умолчанию</p>
            <select
              value={settings.defaultImageModel}
              onChange={(e) => setSettings((s) => ({ ...s, defaultImageModel: e.target.value }))}
              className="w-full py-2.5 px-4 rounded-xl border-2 border-gray-200 bg-white text-[10px] font-bold uppercase"
            >
              {IMAGE_MODEL_POOL.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-gray-500 mb-1">Запасная модель (при включённом переключении)</p>
            <select
              value={settings.imageBackupModel}
              onChange={(e) => setSettings((s) => ({ ...s, imageBackupModel: e.target.value }))}
              className="w-full py-2.5 px-4 rounded-xl border-2 border-gray-200 bg-white text-[10px] font-bold uppercase"
            >
              {IMAGE_MODEL_POOL.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.imageFallbackEnabled}
                onChange={(e) => setSettings((s) => ({ ...s, imageFallbackEnabled: e.target.checked }))}
                className="rounded border-2 border-theme text-theme"
              />
              <span className="text-[10px] font-bold">При ошибке переключаться на запасную модель (KIE → Fal). Выключено — процесс заканчивается после первого ответа.</span>
            </label>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-gray-500 mb-2">Режим выбора модели</p>
            <p className="text-[9px] text-gray-500 mb-1.5">«Выпадающий список» — выбор модели в Дополнительных настройках. Чтобы показывать его на главном экране, включите опцию «Локально» выше.</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="imageChoice"
                  checked={settings.imageModelChoice === 'default_only'}
                  onChange={() => setSettings((s) => ({ ...s, imageModelChoice: 'default_only' }))}
                  className="rounded-full border-2 border-theme text-theme"
                />
                <span className="text-[10px] font-bold">По умолчанию (без выбора)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="imageChoice"
                  checked={settings.imageModelChoice === 'dropdown'}
                  onChange={() => setSettings((s) => ({ ...s, imageModelChoice: 'dropdown' }))}
                  className="rounded-full border-2 border-theme text-theme"
                />
                <span className="text-[10px] font-bold">Выпадающий список</span>
              </label>
            </div>
          </div>
          {settings.imageModelChoice === 'dropdown' && (
            <div>
              <p className="text-[9px] font-black uppercase text-gray-500 mb-2">Какие модели показывать в списке</p>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto rounded-xl border border-gray-200 p-3">
                {IMAGE_MODEL_POOL.map((m) => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.imageModelsInDropdown.includes(m)}
                      onChange={() => toggleImageModelInDropdown(m)}
                      className="rounded border-2 border-theme text-theme"
                    />
                    <span className="text-[9px] font-bold truncate">{m}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[9px] font-black uppercase text-gray-500 mb-2">Промпт для примерки (Issue #15)</p>
            <div className="space-y-2 mb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="imagePromptMode" checked={settings.imagePromptMode === 'default'} onChange={() => setSettings((s) => ({ ...s, imagePromptMode: 'default' }))} className="rounded-full border-2 border-theme text-theme" />
                <span className="text-[10px] font-bold">Стандартный (редактировать ниже)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="imagePromptMode" checked={settings.imagePromptMode === 'openai'} onChange={() => setSettings((s) => ({ ...s, imagePromptMode: 'openai' }))} className="rounded-full border-2 border-theme text-theme" />
                <span className="text-[10px] font-bold">Через ИИ (Fal)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="imagePromptMode" checked={settings.imagePromptMode === 'custom'} onChange={() => setSettings((s) => ({ ...s, imagePromptMode: 'custom' }))} className="rounded-full border-2 border-theme text-theme" />
                <span className="text-[10px] font-bold">Свой промпт (поле ниже)</span>
              </label>
            </div>
            {settings.imagePromptMode === 'default' && (
              <textarea value={settings.imagePromptDefaultText} onChange={(e) => setSettings((s) => ({ ...s, imagePromptDefaultText: e.target.value }))} rows={4} className="w-full py-2 px-3 rounded-xl border-2 border-gray-200 text-[10px] font-medium resize-y" placeholder="Стандартный промпт для примерки" />
            )}
            {settings.imagePromptMode === 'custom' && (
              <textarea value={settings.imagePromptCustom} onChange={(e) => setSettings((s) => ({ ...s, imagePromptCustom: e.target.value }))} rows={4} className="w-full py-2 px-3 rounded-xl border-2 border-gray-200 text-[10px] font-medium resize-y" placeholder="Введите свой промпт" />
            )}
          </div>
        </section>

        {/* Видео */}
        <section className="space-y-4">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-700">Видео</h3>
          <div>
            <p className="text-[9px] font-black uppercase text-gray-500 mb-1">Модель по умолчанию</p>
            <select
              value={settings.defaultVideoModel}
              onChange={(e) => setSettings((s) => ({ ...s, defaultVideoModel: e.target.value }))}
              className="w-full py-2.5 px-4 rounded-xl border-2 border-gray-200 bg-white text-[10px] font-bold uppercase"
            >
              {VIDEO_MODEL_POOL.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-gray-500 mb-1">Запасная модель</p>
            <select
              value={settings.videoBackupModel}
              onChange={(e) => setSettings((s) => ({ ...s, videoBackupModel: e.target.value }))}
              className="w-full py-2.5 px-4 rounded-xl border-2 border-gray-200 bg-white text-[10px] font-bold uppercase"
            >
              {VIDEO_MODEL_POOL.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-gray-500 mb-2">Режим выбора модели</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="videoChoice"
                  checked={settings.videoModelChoice === 'default_only'}
                  onChange={() => setSettings((s) => ({ ...s, videoModelChoice: 'default_only' }))}
                  className="rounded-full border-2 border-theme text-theme"
                />
                <span className="text-[10px] font-bold">По умолчанию</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="videoChoice"
                  checked={settings.videoModelChoice === 'dropdown'}
                  onChange={() => setSettings((s) => ({ ...s, videoModelChoice: 'dropdown' }))}
                  className="rounded-full border-2 border-theme text-theme"
                />
                <span className="text-[10px] font-bold">Выпадающий список</span>
              </label>
            </div>
          </div>
          {settings.videoModelChoice === 'dropdown' && (
            <div>
              <p className="text-[9px] font-black uppercase text-gray-500 mb-2">Какие модели показывать</p>
              <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto rounded-xl border border-gray-200 p-3">
                {VIDEO_MODEL_POOL.map((m) => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.videoModelsInDropdown.includes(m)}
                      onChange={() => toggleVideoModelInDropdown(m)}
                      className="rounded border-2 border-theme text-theme"
                    />
                    <span className="text-[9px] font-bold truncate">{m}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[9px] font-black uppercase text-gray-500 mb-2">Промпт для видео (Issue #15)</p>
            <div className="space-y-2 mb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="videoPromptMode" checked={settings.videoPromptMode === 'default'} onChange={() => setSettings((s) => ({ ...s, videoPromptMode: 'default' }))} className="rounded-full border-2 border-theme text-theme" />
                <span className="text-[10px] font-bold">Стандартный (редактировать ниже)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="videoPromptMode" checked={settings.videoPromptMode === 'openai'} onChange={() => setSettings((s) => ({ ...s, videoPromptMode: 'openai' }))} className="rounded-full border-2 border-theme text-theme" />
                <span className="text-[10px] font-bold">По умолчанию бэкенда</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="videoPromptMode" checked={settings.videoPromptMode === 'custom'} onChange={() => setSettings((s) => ({ ...s, videoPromptMode: 'custom' }))} className="rounded-full border-2 border-theme text-theme" />
                <span className="text-[10px] font-bold">Свой промпт (поле ниже)</span>
              </label>
            </div>
            {(settings.videoPromptMode === 'default' || settings.videoPromptMode === 'custom') && (
              <textarea
                value={settings.videoPromptMode === 'default' ? settings.videoPromptDefaultText : settings.videoPromptCustom}
                onChange={(e) => setSettings((s) => ({ ...s, ...(settings.videoPromptMode === 'default' ? { videoPromptDefaultText: e.target.value } : { videoPromptCustom: e.target.value }) }))}
                rows={3}
                className="w-full py-2 px-3 rounded-xl border-2 border-gray-200 text-[10px] font-medium resize-y"
                placeholder={settings.videoPromptMode === 'default' ? 'Стандартный промпт для видео' : 'Введите свой промпт'}
              />
            )}
          </div>
        </section>

        <p className="text-[8px] text-gray-400 uppercase">Вход по паролю — заглушка. Авторизация будет реализована позже.</p>
      </div>
    </div>
  );
};
