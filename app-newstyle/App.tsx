import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from './src/api/client';
import { 
  UserRole, Theme, AIProvider, AppState, TryOnLimits, 
  MagicPreset, CollectionItem, Language 
} from './types';
import { 
  DEFAULT_LIMITS, DEFAULT_PRESETS, LIMITS_CONFIG, MOCK_SHOPS 
} from './constants';
import { translations } from './translations';

// Components
import { Header } from './components/Header';
import { Step1UploadUser } from './components/Step1UploadUser';
import { Step2UploadClothing } from './components/Step2UploadClothing';
import { Step3Result } from './components/Step3Result';
import { Step4Video } from './components/Step4Video';
import { LookScroller } from './components/LookScroller';
import { AuthModal } from './components/AuthModal';
import { AdminPanel } from './components/AdminPanel';
import { AdminDebugPanel } from './components/AdminDebugPanel';

// Единая база для всего фронта: используем тот же URL, что и демо simple-tryon.
const API_BASE = API_URL;
const BACKEND_USER_ID_KEY = 'your_ai_style_backend_user_id';

const App: React.FC = () => {
  const STORAGE_KEY = 'your_ai_style_2026';

  const [state, setState] = useState<AppState>(() => {
    const defaultState: AppState = {
      role: UserRole.USER,
      theme: Theme.LAVENDER,
      limits: DEFAULT_LIMITS,
      provider: AIProvider.GEMINI,
      auth: { 
        isLoggedIn: false, 
        hasPaidSubscription: false, 
        userPhotos: [], 
        garmentMemory: [], 
        lookHistory: [], 
        likedLooks: [],
        selectedUserPhoto: undefined,
      }
    };

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Deep merge auth to ensure new arrays exist
        let merged: AppState = {
          ...defaultState,
          ...parsed,
          auth: {
            ...defaultState.auth,
            ...(parsed.auth || {})
          }
        };

        // Санитация "Моих фото" и "гардероба":
        // 1) убираем старые data:base64 и дубликаты URL из userPhotos,
        // 2) чистим garmentMemory от URL, которые относятся к людям или к истории примерок.
        if (Array.isArray(merged.auth.userPhotos)) {
          const cleanedUserPhotos = Array.from(
            new Set(
              merged.auth.userPhotos
                .filter(Boolean)
                .filter((u: string) => !u.startsWith('data:'))
            )
          );

          const historyUrls = Array.isArray(merged.auth.lookHistory)
            ? merged.auth.lookHistory
                .map((h: any) => h?.imageUrl)
                .filter(Boolean)
            : [];

          const userSet = new Set(cleanedUserPhotos as string[]);
          const historySet = new Set(historyUrls as string[]);

          const originalGarments = Array.isArray(merged.auth.garmentMemory)
            ? merged.auth.garmentMemory
            : [];

          const cleanedGarments = Array.from(
            new Set(
              originalGarments
                .filter(Boolean)
                // В гардеробе не должно быть ни исходных фото людей,
                // ни результатов примерок из истории.
                .filter((u: string) => !userSet.has(u) && !historySet.has(u))
            )
          );

          merged = {
            ...merged,
            auth: {
              ...merged.auth,
              userPhotos: cleanedUserPhotos,
              garmentMemory: cleanedGarments,
              // если выбранное фото больше не существует, сбрасываем выбор
              selectedUserPhoto:
                merged.auth.selectedUserPhoto && cleanedUserPhotos.includes(merged.auth.selectedUserPhoto)
                  ? merged.auth.selectedUserPhoto
                  : undefined,
            },
          };
        }

        return merged;
      }
    } catch (e) { console.error("Persistence Load Error", e); }
    return defaultState;
  });

  const [language] = useState<Language>(Language.RU);
  const [currentStep, setCurrentStep] = useState<number>(0); // 0: Hero, 1: User Photo, 2: Clothing, 3: Result, 4: Video, 5: Scroller
  const [view, setView] = useState<'home' | 'settings' | 'adminTest'>('home');

  const [hasApiKey, setHasApiKey] = useState<boolean>(true); // Default to true, check in effect

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      }
    };
    checkKey();
  }, []);

  const handleOpenKeySelector = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };
  
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [garmentPhoto, setGarmentPhoto] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultVideo, setResultVideo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tryonError, setTryonError] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [presets, setPresets] = useState<MagicPreset[]>(DEFAULT_PRESETS);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const [backendUserId, setBackendUserId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(BACKEND_USER_ID_KEY);
    } catch {
      return null;
    }
  });
  const [currentPhotoId, setCurrentPhotoId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [backendLooks, setBackendLooks] = useState<{ id: string; imageUrl: string }[]>([]);

  const tryonAbortRef = useRef<AbortController | null>(null);
  const videoAbortRef = useRef<AbortController | null>(null);
  const activeTryonSessionRef = useRef<string | null>(null);
  const activeVideoSessionRef = useRef<string | null>(null);


  const t = translations[language];

  const logError = (source: string, err: any) => {
    try {
      const time = new Date().toISOString();
      const message =
        (err && typeof err === 'object' && 'message' in err && (err as any).message) ||
        (typeof err === 'string' ? err : JSON.stringify(err));
      const entry = `[${time}] [${source}] ${message}`;
      setDebugLogs(prev => [entry, ...prev].slice(0, 100));
    } catch {

      // ignore logging errors
    }
  };

  useEffect(() => {
    return () => {
      tryonAbortRef.current?.abort();
      videoAbortRef.current?.abort();
    };
  }, []);

  const updateBackendUserIdFromHeaders = (res: Response) => {
    try {
      const headerId = res.headers.get('x-user-id');
      if (headerId && headerId !== backendUserId) {
        setBackendUserId(headerId);
        if (typeof window !== 'undefined') {
          localStorage.setItem(BACKEND_USER_ID_KEY, headerId);
        }
      }
    } catch {
      // ignore header errors
    }
  };

  // GET /api/looks — наш бэкенд: optionalAuth, ответ { looks: [{ id, imageUrl, ... }] }
  useEffect(() => {
    const fetchLooks = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/looks`);
        if (!res.ok) throw new Error(`GET /api/looks ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data?.looks) ? data.looks : Array.isArray(data) ? data : [];
        setBackendLooks(list.map((x: any) => ({ id: String(x.id), imageUrl: String(x.imageUrl || '') })));
      } catch (err) {
        console.error('Looks load error', err);
        logError('LOOKS', err);
      }
    };
    fetchLooks();
  }, []);

  // GET /api/my/photos — у нашего бэкенда нет; при 404 считаем пустой список
  useEffect(() => {
    if (!backendUserId) return;
    const fetchMyPhotos = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/my/photos`, {
          headers: { 'X-User-Id': backendUserId },
        });
        if (!res.ok && res.status !== 404) return;
        if (res.status === 404) return;
        const data = await res.json();
        const urls: string[] = Array.isArray(data)
          ? data.map((x: any) => String(x.url)).filter(Boolean)
          : [];
        if (urls.length === 0) return;
        setState(prev => {
          const existing = new Set(prev.auth?.userPhotos || []);
          const merged = [...urls.filter((u) => !existing.has(u)), ...(prev.auth?.userPhotos || [])];
          return {
            ...prev,
            auth: { ...prev.auth, userPhotos: merged },
          };
        });
      } catch (err) {
        console.error('my photos load error', err);
        logError('MY_PHOTOS', err);
      }
    };
    fetchMyPhotos();
  }, [backendUserId, setState]);

  // GET /api/history — наш бэкенд: requireAuth (Bearer). При 401 — пустая история.
  useEffect(() => {
    if (!backendUserId) return;
    const fetchHistory = async () => {
      try {
        const headers: Record<string, string> = {};
        const token = localStorage.getItem('tvoiisty_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        else headers['X-User-Id'] = backendUserId;
        const res = await fetch(`${API_BASE}/api/history`, { headers });
        if (!res.ok) {
          if (res.status === 401) return;
          return;
        }
        const data = await res.json();
        if (!Array.isArray(data)) return;
        const items = data.map((x: any) => ({
          id: String(x.sessionId),
          imageUrl: String(x.imageUrl || ''),
          videoUrl: x.videoUrl ? String(x.videoUrl) : undefined,
          timestamp: x.createdAt ? (typeof x.createdAt === 'string' ? Date.parse(x.createdAt) : Number(x.createdAt)) || Date.now() : Date.now(),
        }));
        setState(prev => ({
          ...prev,
          auth: { ...prev.auth, lookHistory: items },
        }));
      } catch (err) {
        console.error('history load error', err);
        logError('HISTORY', err);
      }
    };
    fetchHistory();
  }, [backendUserId, setState]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    document.body.className = `theme-${state.theme} transition-colors duration-500 antialiased overflow-x-hidden`;
  }, [state]);

  interface UploadedPhoto {
    id: string;
    url: string;
  }

  const uploadUserPhotoToBackend = async (img: string): Promise<UploadedPhoto | null> => {
    try {
      let blob: Blob;
      if (!img) {
        throw new Error('no-image');
      }

      // Если это уже URL (например, сохранённое фото/результат) — просто скачиваем как Blob.
      if (img.startsWith('http://') || img.startsWith('https://')) {
        const r = await fetch(img, { mode: 'cors' });
        if (!r.ok) throw new Error(`fetch image ${r.status}`);
        blob = await r.blob();
      } else if (img.startsWith('data:')) {
        // Классический dataURL: data:image/png;base64,XXXX
        const base64 = img.includes(',') ? img.split(',')[1] : '';
        if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64.replace(/\s/g, ''))) {
          throw new Error('invalid-base64-dataurl');
        }
        try {
          const binary = atob(base64);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          blob = new Blob([bytes], { type: 'image/png' });
        } catch (e) {
          throw new Error('atob-failed');
        }
      } else {
        // Непонятный формат строки — не пытаемся декодировать через atob, просто логируем и выходим.
        throw new Error('unsupported-image-format');
      }
      const formData = new FormData();
      formData.append('file', blob, blob.type?.startsWith('image/') ? 'photo.' + blob.type.split('/')[1] : 'photo.png');
      formData.append('type', 'person');

      const headers: Record<string, string> = {};
      if (backendUserId) headers['X-User-Id'] = backendUserId;

      const res = await fetch(`${API_BASE}/api/media/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!res.ok) throw new Error(`upload failed ${res.status}`);
      updateBackendUserIdFromHeaders(res);
      const data = await res.json();
      // Наш бэкенд возвращает assetId и url
      const id = (data?.assetId ?? data?.id) ? String(data.assetId ?? data.id) : null;
      const url = data?.url ? String(data.url) : '';
      if (id) {
        setCurrentPhotoId(id);
      }
      if (!id || !url) {
        return null;
      }
      return { id, url };
    } catch (err) {
      console.error('uploadUserPhotoToBackend error', err);
      logError('UPLOAD_PHOTO', err);
      return null;
    }
  };

  const uploadClothingToBackend = async (img: string): Promise<{ id: string; url: string } | null> => {
    try {
      let blob: Blob;
      if (img.startsWith('http://') || img.startsWith('https://')) {
        const r = await fetch(img, { mode: 'cors' });
        if (!r.ok) throw new Error(`fetch image ${r.status}`);
        blob = await r.blob();
      } else if (img.startsWith('data:')) {
        const base64 = img.includes(',') ? img.split(',')[1] : '';
        if (!base64) throw new Error('invalid-data-url');
        const bin = atob(base64.replace(/\s/g, ''));
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        blob = new Blob([arr], { type: img.match(/data:([^;]+)/)?.[1] || 'image/png' });
      } else {
        return null;
      }
      const formData = new FormData();
      formData.append('file', blob, 'clothing.png');
      formData.append('type', 'clothing');
      const headers: Record<string, string> = {};
      if (backendUserId) headers['X-User-Id'] = backendUserId;
      const res = await fetch(`${API_BASE}/api/media/upload`, { method: 'POST', headers, body: formData });
      if (!res.ok) throw new Error(`upload failed ${res.status}`);
      const data = await res.json();
      const id = (data?.assetId ?? data?.id) ? String(data.assetId ?? data.id) : null;
      const url = data?.url ? String(data.url) : '';
      if (!id || !url) return null;
      return { id, url };
    } catch (err) {
      console.error('uploadClothingToBackend error', err);
      logError('UPLOAD_CLOTHING', err);
      return null;
    }
  };

  const handleUserPhotoUpload = (img: string) => {
    setUserPhoto(img);

    // После успешной загрузки добавляем фото в "Мои фото" один раз,
    // используя URL из backend, чтобы не было дублей между base64 и URL.
    uploadUserPhotoToBackend(img).then((uploaded) => {
      if (!uploaded) return;
      const url = uploaded.url;
      setState(prev => {
        const userPhotos = prev.auth?.userPhotos || [];
        if (userPhotos.includes(url)) {
          return {
            ...prev,
            auth: { ...prev.auth, selectedUserPhoto: url },
          };
        }
        const next = [url, ...userPhotos];
        const limited = next.slice(0, 10); // лимит 10 фото
        return {
          ...prev,
          auth: { ...prev.auth, userPhotos: limited, selectedUserPhoto: url }
        };
      });
    });
  };

  const handleTryOn = async (garment: string) => {
    if (!userPhoto || !garment) return;
    
    // запоминаем активное фото пользователя для последующих заходов
    setState(prev => ({
      ...prev,
      auth: { ...prev.auth, selectedUserPhoto: userPhoto },
    }));

    setGarmentPhoto(garment);
    setTryonError(null);
    setIsProcessing(true);
    setResultImage(null);
    setResultVideo(null);
    setResultId(null);
    setCurrentStep(3);
    
    try {
      // cancel any previous try-on polling
      if (tryonAbortRef.current) {
        tryonAbortRef.current.abort();
      }
      const tryonController = new AbortController();
      tryonAbortRef.current = tryonController;

      // Ensure we have uploaded photo to backend
      let photoId = currentPhotoId;
      if (!photoId) {
        const uploaded = await uploadUserPhotoToBackend(userPhoto);
        photoId = uploaded?.id ?? null;
      }
      if (!photoId) {
        throw new Error('no-photo');
      }

      // Наш API: person_asset_id, и один из look_id или clothing_image_url
      let lookId: string | null = null;
      let clothingImageUrl: string | null = null;
      if (backendLooks.length > 0 && garment.startsWith('http')) {
        const matched = backendLooks.find((l) => l.imageUrl === garment);
        lookId = matched ? matched.id : null;
      }
      if (!lookId && (garment.startsWith('http') || garment.startsWith('https'))) {
        clothingImageUrl = garment;
      }
      if (!lookId && !clothingImageUrl) {
        // Одежда не из каталога (например data URL) — загружаем и используем URL
        const uploaded = await uploadClothingToBackend(garment);
        clothingImageUrl = uploaded?.url ?? null;
      }
      if (!lookId && !clothingImageUrl) {
        throw new Error('no-looks-available');
      }

      const body: Record<string, unknown> = { person_asset_id: photoId };
      if (lookId) body.look_id = lookId;
      if (clothingImageUrl) body.clothing_image_url = clothingImageUrl;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (backendUserId) headers['X-User-Id'] = backendUserId;

      const res = await fetch(`${API_BASE}/api/tryon`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `tryon-start-failed-${res.status}`);
      }
      const data = await res.json();
      const sessionId = String(data.tryon_id ?? data.sessionId);
      setCurrentSessionId(sessionId);
      activeTryonSessionRef.current = sessionId;

      // Poll try-on status until completed or failed.
      const maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (activeTryonSessionRef.current !== sessionId) {
          return;
        }
        const headers: Record<string, string> = {};
        if (backendUserId) headers['X-User-Id'] = backendUserId;
        const statusRes = await fetch(`${API_BASE}/api/tryon/${sessionId}`, {
          signal: tryonController.signal,
          headers,
        });
        if (!statusRes.ok) {
          const body = await statusRes.json().catch(() => ({}));
          throw new Error(body?.error || `tryon-status-failed-${statusRes.status}`);
        }
        const statusData = await statusRes.json();
        const imageUrl = statusData.image_url ?? statusData.imageUrl;
        if (statusData.status === 'completed' && imageUrl) {
          const newId = sessionId;
          setResultId(newId);
          setResultImage(imageUrl);
          setState(prev => {
            const history = prev.auth?.lookHistory || [];
            return {
              ...prev,
              auth: { 
                ...prev.auth, 
                lookHistory: [
                  { id: newId, imageUrl, timestamp: Date.now() }, 
                  ...history.slice(0, 49)
                ] 
              }
            };
          });
          return;
        }
        if (statusData.status === 'failed') {
          throw new Error('tryon-failed');
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error('tryon-timeout');
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      console.error("Try-on error:", err);
      logError('TRYON', err);
      setTryonError(
        err && typeof err === 'object' && 'message' in err ? String(err.message) : 'tryon-error',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryTryOn = () => {
    if (garmentPhoto) {
      handleTryOn(garmentPhoto);
    }
  };

  const handleVideoCreated = (videoUrl: string) => {
    setResultVideo(videoUrl);
    if (resultId) {
      setState(prev => {
        const history = prev.auth?.lookHistory || [];
        return {
          ...prev,
          auth: {
            ...prev.auth,
            lookHistory: history.map(item => 
              item.id === resultId ? { ...item, videoUrl } : item
            )
          }
        };
      });
    }
  };

  const handleReset = () => {
    setCurrentStep(1);
    setUserPhoto(null);
    setGarmentPhoto(null);
    setResultImage(null);
    setResultVideo(null);
    setTryonError(null);
    activeTryonSessionRef.current = null;
    activeVideoSessionRef.current = null;
    tryonAbortRef.current?.abort();
    videoAbortRef.current?.abort();
  };

  const handleCreateVideo = async () => {
    if (!resultImage || !backendUserId || !currentSessionId) return;
    setIsProcessing(true);
    try {
      // cancel any previous video polling
      if (videoAbortRef.current) {
        videoAbortRef.current.abort();
      }
      const videoController = new AbortController();
      videoAbortRef.current = videoController;
      activeVideoSessionRef.current = currentSessionId;

      const startRes = await fetch(`${API_BASE}/api/tryon/${currentSessionId}/video`, {
        method: 'POST',
        signal: videoController.signal,
        headers: { 'X-User-Id': backendUserId },
      });
      if (!startRes.ok) {
        const body = await startRes.json().catch(() => ({}));
        throw new Error(body?.error || `video-start-failed-${startRes.status}`);
      }

      const maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (activeVideoSessionRef.current !== currentSessionId) {
          return;
        }
        const statusRes = await fetch(`${API_BASE}/api/tryon/${currentSessionId}/video-status`, {
          signal: videoController.signal,
          headers: { 'X-User-Id': backendUserId },
        });
        if (!statusRes.ok) {
          const body = await statusRes.json().catch(() => ({}));
          throw new Error(body?.error || `video-status-failed-${statusRes.status}`);
        }
        const statusData = await statusRes.json();
        if (statusData.status === 'completed' && statusData.videoUrl) {
          handleVideoCreated(statusData.videoUrl);
          return;
        }
        if (statusData.status === 'failed') {
          throw new Error('video-failed');
        }
        if (statusData.status === 'none') {
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      throw new Error('video-timeout');
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      console.error("Video error:", err);
      logError('VIDEO', err);
      alert("Ошибка создания видео.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStart = () => {
    const photos = state.auth?.userPhotos || [];
    const selected = state.auth?.selectedUserPhoto;

    if (selected && photos.includes(selected)) {
      // Есть выбранное фото — сразу переходим к выбору одежды (галерея образов)
      setUserPhoto(selected);
      setCurrentStep(2);
    } else if (photos.length > 0) {
      // Есть сохранённые фото, но нет выбранного — берём первое как дефолт
      const first = photos[0];
      setUserPhoto(first);
      setState(prev => ({
        ...prev,
        auth: { ...prev.auth, selectedUserPhoto: first },
      }));
      setCurrentStep(2);
    } else {
      // Фото вообще нет — сразу показываем экран загрузки (Step1 сам откроет upload)
      setCurrentStep(1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-6 animate-in fade-in duration-1000">
            <div className="mb-12 relative">
              <div className="absolute -inset-4 bg-[var(--primary)]/5 blur-3xl rounded-full"></div>
              <h1 className="text-6xl font-light tracking-tight mb-6 relative text-slate-900">
                Виртуальная <br />
                <span className="font-serif italic text-[var(--primary)]">примерочная</span>
              </h1>
            </div>
            <p className="text-base text-slate-500 mb-12 max-w-sm leading-relaxed font-medium">
              Загрузите своё фото и фото одежды, <br />
              которую хотите примерить
            </p>
            <button 
              onClick={handleStart}
              className="px-14 py-5 bg-white text-slate-900 rounded-full font-semibold text-xs uppercase tracking-[0.2em] shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all active:scale-95 border border-slate-100"
            >
              {t.scrollDown}
            </button>
            <div className="mt-20 animate-bounce opacity-20">
              <span className="text-xl">↓</span>
            </div>
          </div>
        );
      case 1:
        return (
          <Step1UploadUser
            onUploadNew={handleUserPhotoUpload}
            onSelectPhoto={(url) => {
              setUserPhoto(url);
              setState(prev => ({
                ...prev,
                auth: { ...prev.auth, selectedUserPhoto: url },
              }));
              setCurrentStep(2);
            }}
            t={t}
            state={state}
            setState={setState}
          />
        );
      case 2:
        return <Step2UploadClothing 
          onUpload={handleTryOn} 
          t={t} 
          state={state}
          setState={setState}
          backendLooks={backendLooks}
        />;
      case 3:
        return <Step3Result 
          image={resultImage} 
          isProcessing={isProcessing} 
          onCreateVideo={() => {
            setCurrentStep(4);
            handleCreateVideo();
          }}
          onReset={() => setCurrentStep(5)}
          error={tryonError}
          onRetry={handleRetryTryOn}
          onChooseAnother={() => setCurrentStep(2)}
          t={t} 
        />;
      case 4:
        return <Step4Video 
          video={resultVideo} 
          onReset={() => setCurrentStep(5)}
          t={t} 
        />;
      case 5:
        return <LookScroller 
          items={state.auth.lookHistory} 
          t={t} 
          onReset={handleReset} 
          state={state} 
          setState={setState} 
        />;
      default:
        return null;
    }
  };

  const renderView = () => {
    switch (view) {
      case 'settings':
        return (
          <AdminPanel
            isOpen={true}
            onClose={() => setView('home')}
            state={state}
            setState={setState}
            presets={presets}
            setPresets={setPresets}
          />
        );
      case 'adminTest':
        return <AdminDebugPanel logs={debugLogs} onClose={() => setView('home')} />;
      case 'home':
      default:
        return renderStep();
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans select-none bg-[var(--bg-main)]">
      <Header 
        state={state} 
        setState={setState} 
        language={language}
        setCurrentStep={setCurrentStep}
        setView={setView}
        t={t}
      />

      <main className="flex-1 container mx-auto max-w-4xl pt-20 pb-12">
        {renderView()}
      </main>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onAuthSuccess={(email, role) => {
        setState(prev => ({ ...prev, auth: { ...prev.auth, isLoggedIn: true, userEmail: email }, role: role as UserRole }));
        setIsAuthOpen(false);
      }} />
    </div>
  );
};

export default App;
