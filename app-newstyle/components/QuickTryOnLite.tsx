import React, { useState, useRef } from 'react';
import { API_URL } from '../src/api/client';
import { startTryOnLite, startAnimationLite } from '../services/tryonService';
import { getOrCreateOwnerClientId, getOwnerHeaders } from '../services/ownerService';
import { IMAGE_VALIDATION_ERROR, isValidImageFile } from '../utils/fileValidation';
import { compressImageFile, compressImageUrl } from '../utils/imageCompression';

type TryonState = 'idle' | 'running' | 'done' | 'error';
type VideoState = 'idle' | 'starting' | 'ready' | 'error';

interface QuickTryOnLiteProps {
  t: any;
  onResult?: (sessionId: string, imageUrl: string) => void;
  onVideoResult?: (sessionId: string, videoUrl: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

export const QuickTryOnLite: React.FC<QuickTryOnLiteProps> = ({ t, onResult, onVideoResult, onBusyChange }) => {
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
  const [resultSessionId, setResultSessionId] = useState<string | null>(null);
  // Оригинальный URL с сервера (для анимации) — blob: нельзя слать на сервер
  const [resultImageServerUrl, setResultImageServerUrl] = useState<string | null>(null);

  const personInputRef = useRef<HTMLInputElement | null>(null);
  const garmentInputRef = useRef<HTMLInputElement | null>(null);

  // Для лайтовой страницы больше не создаём media-asset и сессии.
  // Просто отправляем два файла напрямую на /api/tryon-lite.

  const handlePersonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isValidImageFile(file)) {
      setTryonError(IMAGE_VALIDATION_ERROR);
      e.target.value = '';
      return;
    }
    setPersonFile(file);
    setPersonPreview(URL.createObjectURL(file));
    setResultImage(null);
    setResultImageServerUrl(null);
    setVideoUrl(null);
    setVideoState('idle');
    setVideoError(null);
    setTryonState('idle');
    setTryonError(null);
  };

  const handleGarmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isValidImageFile(file)) {
      setTryonError(IMAGE_VALIDATION_ERROR);
      e.target.value = '';
      return;
    }
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
    onBusyChange?.(true);
    setTryonState('running');
    setTryonError(null);
    setResultImage(null);
    setVideoUrl(null);
    setVideoState('idle');
    setVideoError(null);

    try {
      const ownerClientId = getOrCreateOwnerClientId();
      const token = localStorage.getItem('tvoiisty_token');

      // Сжимаем фото перед отправкой (макс 1536px, JPEG 82%)
      const [personCompressed, garmentCompressed] = await Promise.all([
        compressImageFile(personFile),
        compressImageFile(garmentFile),
      ]);

      const { imageUrl, sessionId } = await startTryOnLite({
        apiBase: API_URL,
        person: personCompressed,
        garment: garmentCompressed,
        headers: getOwnerHeaders(ownerClientId, token),
      });

      const itemId = sessionId || `tryon-lite-${Date.now()}`;

      // Сохраняем оригинальный URL для анимации (blob: нельзя слать на сервер)
      setResultImageServerUrl(imageUrl);

      // Сжимаем для отображения
      const compressedBlob = await compressImageUrl(imageUrl);
      const displayUrl = compressedBlob ? URL.createObjectURL(compressedBlob) : imageUrl;

      setResultImage(displayUrl);
      setResultSessionId(itemId);
      setTryonState('done');
      if (onResult) {
        onResult(itemId, displayUrl);
      }
    } catch (err: any) {
      console.error('Simple try-on error (adapted)', err);
      setTryonState('error');
      setTryonError('Не удалось создать примерку. Попробуйте ещё раз.');
    } finally {
      setIsBusy(false);
      onBusyChange?.(false);
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
    if (!resultImageServerUrl || !API_URL) return;
    if (videoState === 'starting') return;

    setVideoState('starting');
    setIsBusy(true);
    onBusyChange?.(true);
    setVideoError(null);

    try {
      const ownerClientId = getOrCreateOwnerClientId();
      const token = localStorage.getItem('tvoiisty_token');
      const { videoUrl: createdVideoUrl } = await startAnimationLite({
        apiBase: API_URL,
        imageUrl: resultImageServerUrl,
        headers: getOwnerHeaders(ownerClientId, token),
      });
      setVideoUrl(createdVideoUrl);
      setVideoState('ready');
      if (onVideoResult && resultSessionId) {
        onVideoResult(resultSessionId, createdVideoUrl);
      }
    } catch (e) {
      console.error('Simple try-on video error', e);
      setVideoState('error');
      setVideoError('Не удалось создать видео. Попробуйте ещё раз.');
    } finally {
      setIsBusy(false);
      onBusyChange?.(false);
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
                {/* Результат примерки */}
                <div className="relative aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-white bg-slate-100 flex items-center justify-center">
                  <img
                    src={resultImage}
                    alt="Результат примерки"
                    className="w-full h-full object-contain rounded-[2.2rem]"
                  />
                  {/* Кнопки всегда видны */}
                  <div className="absolute top-4 right-4 flex flex-col gap-2.5">
                    <button
                      onClick={handleAnimate}
                      disabled={videoState === 'starting' || isBusy}
                      className={`w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 ${
                        videoState === 'starting' ? 'text-slate-300 cursor-wait' : 'text-slate-600 hover:shadow-lg'
                      }`}
                      title="Анимировать"
                    >
                      {videoState === 'starting'
                        ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                        : <span className="text-base leading-none">{videoUrl ? '↺' : '▷'}</span>
                      }
                    </button>
                    <button
                      onClick={handleDownload}
                      className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-600 shadow-md transition-all active:scale-90 hover:shadow-lg"
                      title="Скачать"
                    >
                      <span className="text-base leading-none">↓</span>
                    </button>
                    <button
                      onClick={handleShareTelegram}
                      className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-600 shadow-md transition-all active:scale-90 hover:shadow-lg"
                      title="Поделиться"
                    >
                      <span className="text-base leading-none">↗</span>
                    </button>
                  </div>
                </div>

                {/* Секция видео — появляется после анимации */}
                {videoState === 'ready' && videoUrl && (
                  <div className="relative aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-white bg-[var(--bg-card)]">
                    <video
                      src={videoUrl}
                      autoPlay
                      loop
                      playsInline
                      muted
                      className="w-full h-full object-contain rounded-[2.2rem]"
                    />
                    {/* Кнопки на видео */}
                    <div className="absolute top-4 right-4 flex flex-col gap-2.5">
                      <button
                        onClick={handleAnimate}
                        disabled={isBusy}
                        className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-600 shadow-md transition-all active:scale-90 hover:shadow-lg disabled:opacity-40"
                        title="Переанимировать"
                      >
                        <span className="text-base leading-none">↺</span>
                      </button>
                      <a
                        href={videoUrl}
                        download={`animation-${Date.now()}.mp4`}
                        className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-600 shadow-md transition-all active:scale-90 hover:shadow-lg"
                        title="Скачать видео"
                      >
                        <span className="text-base leading-none">↓</span>
                      </a>
                      <button
                        onClick={() => { if (videoUrl) window.open(`https://t.me/share/url?url=${encodeURIComponent(videoUrl)}`, '_blank'); }}
                        className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-600 shadow-md transition-all active:scale-90 hover:shadow-lg"
                        title="Поделиться"
                      >
                        <span className="text-base leading-none">↗</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Статус анимации */}
                {videoState === 'starting' && (
                  <div className="w-full rounded-[2rem] bg-slate-50 border-2 border-slate-100 p-8 flex flex-col items-center gap-3 text-center">
                    <div className="w-8 h-8 border-2 border-slate-200 border-t-[var(--primary)] rounded-full animate-spin" />
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Создаём анимацию…</p>
                    <p className="text-[10px] text-slate-300 uppercase tracking-widest">Займёт 1–2 минуты</p>
                  </div>
                )}
                {videoState === 'error' && videoError && (
                  <div className="w-full rounded-[2rem] bg-red-50 border-2 border-red-100 p-6 text-center">
                    <p className="text-sm font-semibold text-red-500 mb-1">Не удалось создать анимацию</p>
                    <p className="text-xs text-red-400">{videoError}</p>
                  </div>
                )}
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

