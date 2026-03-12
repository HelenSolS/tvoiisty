import React, { useState, useRef } from 'react';
import { api, apiRaw, API_URL } from '../src/api/client';

type UploadState = 'idle' | 'uploading' | 'uploaded' | 'error';
type TryonState = 'idle' | 'running' | 'done' | 'error';
type VideoState = 'idle' | 'starting' | 'processing' | 'ready' | 'error';

interface UploadedMedia {
  id: string;
  url: string;
  userId?: string | null;
}

interface QuickTryOnLiteProps {
  t: any;
}

export const QuickTryOnLite: React.FC<QuickTryOnLiteProps> = () => {
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [garmentFile, setGarmentFile] = useState<File | null>(null);

  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [garmentPreview, setGarmentPreview] = useState<string | null>(null);

  const [personUpload, setPersonUpload] = useState<UploadState>('idle');
  const [garmentUpload, setGarmentUpload] = useState<UploadState>('idle');

  const [personMedia, setPersonMedia] = useState<UploadedMedia | null>(null);
  const [garmentMedia, setGarmentMedia] = useState<UploadedMedia | null>(null);

  const [backendUserId, setBackendUserId] = useState<string | null>(null);

  const [tryonState, setTryonState] = useState<TryonState>('idle');
  const [tryonError, setTryonError] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [videoState, setVideoState] = useState<VideoState>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [isBusy, setIsBusy] = useState(false);

  const personInputRef = useRef<HTMLInputElement | null>(null);
  const garmentInputRef = useRef<HTMLInputElement | null>(null);

  const uploadOne = async (
    file: File,
    kind: 'person' | 'garment',
  ): Promise<UploadedMedia | null> => {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (backendUserId) headers['X-User-Id'] = backendUserId;

    const setUploadState =
      kind === 'person' ? setPersonUpload : setGarmentUpload;

    setUploadState('uploading');
    try {
      const res = await apiRaw('/api/media/upload', {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!res.ok) {
        setUploadState('error');
        return null;
      }
      const headerId = res.headers.get('x-user-id');
      if (headerId && headerId !== backendUserId) {
        setBackendUserId(headerId);
      }
      const data = await res.json();
      const id = (data?.assetId ?? data?.id) ? String(data.assetId ?? data.id) : '';
      const url = data?.url ? String(data.url) : '';
      if (!id || !url) {
        setUploadState('error');
        return null;
      }
      setUploadState('uploaded');
      return { id, url, userId: headerId || backendUserId || null };
    } catch {
      setUploadState('error');
      return null;
    }
  };

  const handlePersonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPersonFile(file);
    setPersonPreview(URL.createObjectURL(file));
    setPersonMedia(null);
    setPersonUpload('idle');
    setResultImage(null);
    setSessionId(null);
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
    setGarmentMedia(null);
    setGarmentUpload('idle');
    setResultImage(null);
    setTryonState('idle');
    setTryonError(null);
    setSessionId(null);
    setVideoUrl(null);
    setVideoState('idle');
    setVideoError(null);
  };

  const handleTryOn = async () => {
    if (
      isBusy ||
      !personFile ||
      !garmentFile ||
      personUpload === 'uploading' ||
      garmentUpload === 'uploading'
    ) {
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
    setSessionId(null);
    setVideoUrl(null);
    setVideoState('idle');
    setVideoError(null);

    try {
      let person = personMedia;
      let garment = garmentMedia;

      if (!person) {
        person = await uploadOne(personFile, 'person');
        if (!person) throw new Error('upload-person-failed');
        setPersonMedia(person);
      }

      if (!garment) {
        garment = await uploadOne(garmentFile, 'garment');
        if (!garment) throw new Error('upload-garment-failed');
        setGarmentMedia(garment);
      }
      const userId =
        backendUserId || person.userId || garment.userId || null;
      if (!userId) {
        throw new Error('no-backend-user');
      }

      // Используем наш /api/tryon вместо /api/simple-tryon
      const res = await fetch(`${API_URL}/api/tryon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        body: JSON.stringify({
          person_asset_id: person.id,
          clothing_image_url: garment.url,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `tryon-start-failed-${res.status}`);
      }

      const data = await res.json();
      const newSessionId = String(data.tryon_id ?? data.sessionId);
      setSessionId(newSessionId);

      const maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const statusRes = await fetch(`${API_URL}/api/tryon/${newSessionId}`, {
          headers: { 'X-User-Id': userId },
        });
        if (!statusRes.ok) {
          const text = await statusRes.text().catch(() => '');
          throw new Error(text || `tryon-status-failed-${statusRes.status}`);
        }
        const statusData = await statusRes.json();
        const imageUrl =
          statusData.image_url ?? statusData.imageUrl;
        if (statusData.status === 'completed' && imageUrl) {
          setResultImage(imageUrl);
          setTryonState('done');
          return;
        }
        if (statusData.status === 'failed') {
          throw new Error('tryon-failed');
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error('tryon-timeout');
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
    personUpload !== 'uploading' &&
    garmentUpload !== 'uploading' &&
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
    if (!sessionId || !backendUserId || !API_URL) return;
    if (videoState === 'starting' || videoState === 'processing') return;

    setVideoState('starting');
    setVideoError(null);

    try {
      await api(`/api/tryon/${sessionId}/video`, {
        method: 'POST',
        headers: { 'X-User-Id': backendUserId },
      });

      setVideoState('processing');

      const maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const statusData = await api(
          `/api/tryon/${sessionId}/video-status`,
          {
            headers: { 'X-User-Id': backendUserId },
          },
        );
        if (statusData.status === 'completed' && statusData.videoUrl) {
          setVideoUrl(statusData.videoUrl);
          setVideoState('ready');
          return;
        }
        if (statusData.status === 'failed') {
          throw new Error('video-failed');
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error('video-timeout');
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
                  className="w-full h-full object-cover"
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
            {personUpload === 'uploading' && (
              <p className="mt-3 text-[10px] text-slate-400 uppercase tracking-[0.2em]">
                Загружаем…
              </p>
            )}
            {personUpload === 'error' && (
              <p className="mt-3 text-[10px] text-red-500 uppercase tracking-[0.2em]">
                Ошибка загрузки
              </p>
            )}
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
                  className="w-full h-full object-cover"
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
            {garmentUpload === 'uploading' && (
              <p className="mt-3 text-[10px] text-slate-400 uppercase tracking-[0.2em]">
                Загружаем…
              </p>
            )}
            {garmentUpload === 'error' && (
              <p className="mt-3 text-[10px] text-red-500 uppercase tracking-[0.2em]">
                Ошибка загрузки
              </p>
            )}
          </div>
        </div>

        {/* TRY ON button */}
        <div className="flex flex-col items-center mb-12">
          <button
            onClick={handleTryOn}
            disabled={!canTryOn}
            className={`px-16 py-4 rounded-full text-[11px] font-black uppercase tracking-[0.35em] shadow-2xl border border-slate-900/10 transition-all ${
              canTryOn
                ? 'bg-slate-900 text-white hover:shadow-[0_20px_60px_rgba(15,23,42,0.5)] hover:-translate-y-0.5 active:scale-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
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
                <div className="aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-2xl border border-white">
                  <img
                    src={resultImage}
                    alt="Результат примерки"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex flex-col md:flex-row gap-3 justify-center">
                  <button
                    onClick={handleAnimate}
                    className="flex-1 px-5 py-3 rounded-full bg-white text-slate-900 text-[10px] font-black uppercase tracking-[0.25em] shadow-md hover:shadow-lg active:scale-95 transition-all"
                  >
                    АНИМИРОВАТЬ
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex-1 px-5 py-3 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.25em] shadow-md hover:shadow-lg active:scale-95 transition-all"
                  >
                    СОХРАНИТЬ
                  </button>
                  <button
                    onClick={handleShareTelegram}
                    className="flex-1 px-5 py-3 rounded-full bg-[var(--bg-gradient)] text-white text-[10px] font-black uppercase tracking-[0.25em] shadow-md hover:shadow-lg active:scale-95 transition-all"
                  >
                    ЗАПОСТИТЬ
                  </button>
                </div>
              </div>
            ) : tryonState === 'running' ? (
              <div className="w-full max-w-md h-64 rounded-[2.5rem] bg-slate-100 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
                AI генерирует ваш образ…
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

