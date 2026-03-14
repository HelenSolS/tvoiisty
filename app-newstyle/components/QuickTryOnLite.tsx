import React, { useState, useRef } from 'react';
import { API_URL } from '../src/api/client';
import { startTryOnLite, startVideoFromImage } from '../services/tryonService';
import { getOrCreateOwnerClientId, getOwnerHeaders } from '../services/ownerService';

type TryonState = 'idle' | 'running' | 'done' | 'error';
type VideoState = 'idle' | 'starting' | 'ready' | 'error';

interface QuickTryOnLiteProps {
  t: any;
  onResult?: (sessionId: string, imageUrl: string) => void;
}

export const QuickTryOnLite: React.FC<QuickTryOnLiteProps> = ({ t, onResult }) => {
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [garmentFile, setGarmentFile] = useState<File | null>(null);

  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [garmentPreview, setGarmentPreview] = useState<string | null>(null);

  const [tryonState, setTryonState] = useState<TryonState>('idle');
  const [tryonError, setTryonError] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);

  const [videoState, setVideoState] = useState<VideoState>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [isBusy, setIsBusy] = useState(false);

  const personInputRef = useRef<HTMLInputElement | null>(null);
  const garmentInputRef = useRef<HTMLInputElement | null>(null);

  // Для лайтовой страницы больше не создаём media-asset и сессии.
  // Просто отправляем два файла напрямую на /api/tryon-lite.

  const handlePersonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPersonFile(file);
    setPersonPreview(URL.createObjectURL(file));
    setResultImage(null);
    setVideoUrl(null);
    setVideoState('idle');
    setVideoError(null);
    setTryonState('idle');
    setTryonError(null);
  };

  const handleGarmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGarmentFile(file);
    setGarmentPreview(URL.createObjectURL(file));
    setResultImage(null);
    setTryonState('idle');
    setTryonError(null);
    setVideoUrl(null);
    setVideoState('idle');
    setVideoError(null);
  };

  const handleTryOn = async () => {
    if (isBusy || !personFile || !garmentFile) {
      return;
    }
    if (!API_URL) {
      setTryonError('API_URL не настроен');
      return;
    }

    setIsBusy(true);
    setTryonState('running');
    setTryonError(null);
    setResultImage(null);
    setVideoUrl(null);
    setVideoState('idle');
    setVideoError(null);

    try {
      const ownerClientId = getOrCreateOwnerClientId();
      const token = localStorage.getItem('tvoiisty_token');
      const { imageUrl, sessionId } = await startTryOnLite({
        apiBase: API_URL,
        person: personFile,
        garment: garmentFile,
        headers: getOwnerHeaders(ownerClientId, token),
      });

      setResultImage(imageUrl);
      setTryonState('done');
      if (onResult) {
        onResult(sessionId || 'tryon-lite', imageUrl);
      }
    } catch (err: any) {
      console.error('Simple try-on error (adapted)', err);
      setTryonState('error');
      setTryonError('Не удалось создать примерку. Попробуйте ещё раз.');
    } finally {
      setIsBusy(false);
    }
  };

  const canTryOn =
    !!personFile &&
    !!garmentFile &&
    !isBusy;

  const handleDownload = async () => {
    if (!resultImage) return;
    try {
      const res = await fetch(resultImage);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tryon-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download error', e);
    }
  };

  const handleShareTelegram = () => {
    if (!resultImage) return;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(resultImage)}`;
    window.open(shareUrl, '_blank');
  };

  const handleAnimate = async () => {
    if (!resultImage || !API_URL) return;
    if (videoState === 'starting' || videoState === 'processing') return;

    setVideoState('starting');
    setVideoError(null);

    try {
      const ownerClientId = getOrCreateOwnerClientId();
      const token = localStorage.getItem('tvoiisty_token');
      const { videoUrl: createdVideoUrl } = await startVideoFromImage({
        apiBase: API_URL,
        imageUrl: resultImage,
        headers: getOwnerHeaders(ownerClientId, token),
      });
      setVideoUrl(createdVideoUrl);
      setVideoState('ready');
    } catch (e) {
      console.error('Simple try-on video error', e);
      setVideoState('error');
      setVideoError('Не удалось создать видео. Попробуйте ещё раз.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-main)] text-slate-900 px-4">
      <div className="w-full max-w-5xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-4">
            Виртуальная примерка
          </h1>
          <p className="text-sm md:text-base text-slate-500 max-w-xl mx-auto">
            Загрузите своё фото и фото одежды — и посмотрите, как работает наша технология.
          </p>
        </header>

        <div className="grid md:grid-cols-[1fr_auto_1fr] gap-8 items-center mb-12">
          {/* Person card */}
          <div className="bg-[var(--bg-card)] rounded-[3rem] shadow-xl border border-white/40 p-6 md:p-8 flex flex-col items-center">
            <h2 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 mb-2">
              ФОТО ЧЕЛОВЕКА
            </h2>
            <p className="text-sm font-medium text-slate-700 mb-6">
              Загрузите фото человека
            </p>
            <button
              type="button"
              onClick={() => personInputRef.current?.click()}
              className="w-full aspect-[3/4] rounded-[2.5rem] bg-slate-100 flex items-center justify-center overflow-hidden mb-4 focus:outline-none focus:ring-2 focus:ring-slate-400/60"
            >
              {personPreview ? (
                <img
                  src={personPreview}
                  alt="Фото человека"
                  className="w-full h-full object-contain rounded-[2.5rem]"
                />
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
                  НЕТ ФОТО
                </span>
              )}
            </button>
            <p className="text-[9px] text-slate-400 uppercase tracking-[0.2em]">
              Нажмите на область, чтобы {personPreview ? 'заменить фото' : 'выбрать файл'}
            </p>
            <input
              ref={personInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePersonChange}
            />
          </div>

          {/* Plus */}
          <div className="hidden md:flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white shadow-xl flex items-center justify-center text-3xl text-slate-400">
              +
            </div>
          </div>

          {/* Garment card */}
          <div className="bg-[var(--bg-card)] rounded-[3rem] shadow-xl border border-white/40 p-6 md:p-8 flex flex-col items-center">
            <h2 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 mb-2">
              ОДЕЖДА
            </h2>
            <p className="text-sm font-medium text-slate-700 mb-6">
              Загрузите фото одежды
            </p>
            <button
              type="button"
              onClick={() => garmentInputRef.current?.click()}
              className="w-full aspect-[3/4] rounded-[2.5rem] bg-slate-100 flex items-center justify-center overflow-hidden mb-4 focus:outline-none focus:ring-2 focus:ring-slate-400/60"
            >
              {garmentPreview ? (
                <img
                  src={garmentPreview}
                  alt="Одежда"
                  className="w-full h-full object-contain rounded-[2.5rem]"
                />
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
                  НЕТ ФОТО
                </span>
              )}
            </button>
            <p className="text-[9px] text-slate-400 uppercase tracking-[0.2em]">
              Нажмите на область, чтобы {garmentPreview ? 'заменить фото' : 'выбрать файл'}
            </p>
            <input
              ref={garmentInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleGarmentChange}
            />
          </div>
        </div>

        {/* TRY ON button */}
        <div className="flex flex-col items-center mb-12">
          <button
            onClick={handleTryOn}
            disabled={!canTryOn}
            className={`px-16 py-4 rounded-full text-[11px] font-black uppercase tracking-[0.35em] shadow-2xl border border-slate-900/10 transition-all ${
              canTryOn
                ? 'bg-[var(--bg-gradient)] text-white hover:shadow-[0_20px_60px_rgba(99,102,241,0.35)] hover:-translate-y-0.5 active:scale-95'
                : 'bg-white text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            ПРИМЕРИТЬ
          </button>
          {tryonState === 'running' && (
            <p className="mt-4 text-[10px] text-slate-500 uppercase tracking-[0.25em]">
              AI обрабатывает изображение…
            </p>
          )}
        </div>

        {/* Result */}
        <section className="bg-[var(--bg-card)] rounded-[3rem] shadow-xl border border-white/40 p-6 md:p-10 mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 mb-4">
            РЕЗУЛЬТАТ ПРИМЕРКИ
          </h2>
          <div className="w-full flex flex-col items-center">
            {tryonState === 'error' && (
              <div className="w-full max-w-md mb-6 text-center">
                <p className="text-sm font-semibold text-red-500 mb-2">
                  Не удалось создать примерку
                </p>
                {tryonError && (
                  <p className="text-xs text-slate-400 break-words">
                    {tryonError}
                  </p>
                )}
              </div>
            )}
            {resultImage ? (
              <div className="w-full max-w-md space-y-6">
                <div className="relative group aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-2xl border border-white bg-slate-100 flex items-center justify-center p-2">
                  <img
                    src={resultImage}
                    alt="Результат примерки"
                    className="max-w-full max-h-full object-contain rounded-[2.2rem]"
                  />
                  <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button onClick={handleAnimate} className="w-10 h-10 bg-white/85 backdrop-blur-md rounded-full flex items-center justify-center text-slate-900 shadow-md border border-slate-200 hover:shadow-lg active:scale-95 transition-all" title="Анимация">
                      <span className="text-base">🎬</span>
                    </button>
                    <button onClick={handleDownload} className="w-10 h-10 bg-white/85 backdrop-blur-md rounded-full flex items-center justify-center text-slate-900 shadow-md border border-slate-200 hover:shadow-lg active:scale-95 transition-all" title="Скачать">
                      <span className="text-base">📥</span>
                    </button>
                    <button onClick={handleShareTelegram} className="w-10 h-10 bg-white/85 backdrop-blur-md rounded-full flex items-center justify-center text-slate-900 shadow-md border border-slate-200 hover:shadow-lg active:scale-95 transition-all" title="Поделиться">
                      <span className="text-base">↗</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : tryonState === 'running' ? (
              <div className="w-full max-w-md h-64 rounded-[2.5rem] bg-slate-100 flex flex-col items-center justify-center text-[11px] font-medium tracking-[0.06em] text-slate-500">
                <div className="w-8 h-8 mb-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                <p>Создаём образ…</p>
                <p className="mt-1">Выполняется примерка…</p>
                <p className="mt-1 text-slate-400">Ещё немного терпения.</p>
              </div>
            ) : (
              <div className="w-full max-w-md h-40 rounded-[2.5rem] bg-slate-50 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.3em] text-slate-300">
                РЕЗУЛЬТАТ ПОЯВИТСЯ ЗДЕСЬ
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default QuickTryOnLite;

