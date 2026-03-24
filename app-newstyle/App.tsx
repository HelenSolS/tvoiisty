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
import UploadBox from './components/UploadBox';
import ResultView from './components/ResultView';
import QuickTryOnLite from './components/QuickTryOnLite';
import { Step4Video } from './components/Step4Video';
import { LookScroller } from './components/LookScroller';
import { AuthModal } from './components/AuthModal';
import { AdminPanel } from './components/AdminPanel';
import { AdminDebugPanel } from './components/AdminDebugPanel';
import { uploadImage, startTryOnLite, startVideoFromImage } from './services/tryonService';
import { getOrCreateOwnerClientId, getOwnerHeaders, readOwnerClientIdFromResponse } from './services/ownerService';
import {
  enqueuePendingPersonUpload,
  getPendingPersonUploads,
  removePendingPersonUpload,
} from './services/pendingSyncQueue';
import {
  deleteHistoryItem,
  markHistoryViewed,
  normalizeHistoryRows,
  reanimateHistoryItem,
  setHistoryLike,
} from './services/historyService';
import {
  enqueueHistoryDelete,
  enqueueHistoryLike,
  enqueueHistoryReanimate,
  getPendingHistoryActions,
  removePendingHistoryAction,
} from './services/pendingHistoryQueue';

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
          ).slice(0, 10);

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
              lookHistory: Array.isArray(merged.auth.lookHistory)
                ? merged.auth.lookHistory
                    .filter((x: any) => x && x.imageUrl)
                    .sort((a: any, b: any) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0))
                    .slice(0, 50)
                : [],
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
  // Стартовый экран — лендинг с двумя кнопками (step 0).
  // После первого перехода по меню "Главная" пользователь попадает на "Мои фото" (step 1).
  const [currentStep, setCurrentStep] = useState<number>(0); // 0: Hero, 1: User Photo, 2: Clothing, 3: Result, 4: Video, 5: Scroller
  const [view, setView] = useState<'home' | 'settings' | 'adminTest'>('home');
  const [isQuickLite, setIsQuickLite] = useState<boolean>(false);
  const [hasNewHistoryFromQuick, setHasNewHistoryFromQuick] = useState<boolean>(false);

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
  // Образ, который пользователь хотел примерить до того как выбрал фото.
  const [pendingGarment, setPendingGarment] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultVideo, setResultVideo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isQuickProcessing, setIsQuickProcessing] = useState(false);
  const [tryonError, setTryonError] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [presets, setPresets] = useState<MagicPreset[]>(DEFAULT_PRESETS);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const isAnyProcessing = isProcessing || isQuickProcessing;

  const [backendUserId, setBackendUserId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const fromStorage = localStorage.getItem(BACKEND_USER_ID_KEY);
      if (fromStorage && fromStorage.trim()) return fromStorage.trim();
      return getOrCreateOwnerClientId();
    } catch {
      return getOrCreateOwnerClientId();
    }
  });
  const [backendLooks, setBackendLooks] = useState<{ id: string; imageUrl: string }[]>([]);
  const [syncTick, setSyncTick] = useState(0);

  const tryonAbortRef = useRef<AbortController | null>(null);
  const videoAbortRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    const onOnline = () => setSyncTick((v) => v + 1);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);


  useEffect(() => {
    let cancelled = false;
    const syncPendingPersonUploads = async () => {
      const pending = getPendingPersonUploads();
      if (pending.length === 0) return;
      for (const originalImg of pending) {
        if (cancelled) return;
        const uploaded = await uploadUserPhotoToBackend(originalImg);
        if (!uploaded) continue;
        removePendingPersonUpload(originalImg);
        const stableUrl = uploaded.url;
        setState((prev) => {
          const nextPhotos = (prev.auth?.userPhotos || []).map((p) => (p === originalImg ? stableUrl : p));
          const unique = Array.from(new Set(nextPhotos)).slice(0, 10);
          const selectedUserPhoto =
            prev.auth?.selectedUserPhoto === originalImg ? stableUrl : prev.auth?.selectedUserPhoto;
          return {
            ...prev,
            auth: { ...prev.auth, userPhotos: unique, selectedUserPhoto },
          };
        });
      }
    };
    syncPendingPersonUploads();
    return () => {
      cancelled = true;
    };
  }, [syncTick, backendUserId]);

  const updateBackendUserIdFromHeaders = (res: Response) => {
    try {
      const headerId = readOwnerClientIdFromResponse(res);
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

  const getApiHeaders = () => {
    const token = localStorage.getItem('tvoiisty_token');
    return getOwnerHeaders(backendUserId, token);
  };

  const isHttpStatusError = (err: unknown, status: number): boolean => {
    const msg = err && typeof err === 'object' && 'message' in err ? String((err as any).message || '') : '';
    return msg.includes(`-${status}`) || msg.includes(` ${status}`);
  };

  // GET /api/looks — загружаем вещи из галереи с сервера
  useEffect(() => {
    const fetchLooks = async () => {
      try {
        const token = localStorage.getItem('tvoiisty_token');
        const res = await fetch(`${API_BASE}/api/looks`, {
          headers: getOwnerHeaders(backendUserId, token),
        });
        updateBackendUserIdFromHeaders(res);
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
  }, [backendUserId, syncTick]);

  useEffect(() => {
    let cancelled = false;
    const flushPendingHistory = async () => {
      const pending = getPendingHistoryActions();
      if (pending.length === 0) return;
      for (const action of pending) {
        if (cancelled) return;
        try {
          if (action.kind === 'like') {
            await setHistoryLike({ apiBase: API_BASE, headers: getApiHeaders() }, action.sessionId, action.liked);
          } else if (action.kind === 'delete') {
            await deleteHistoryItem({ apiBase: API_BASE, headers: getApiHeaders() }, action.sessionId);
          } else if (action.kind === 'reanimate') {
            const { videoUrl } = await reanimateHistoryItem(
              { apiBase: API_BASE, headers: getApiHeaders() },
              action.sessionId,
            );
            setState((prev) => ({
              ...prev,
              auth: {
                ...prev.auth,
                lookHistory: (prev.auth.lookHistory || []).map((x) =>
                  x.id === action.sessionId ? { ...x, videoUrl } : x,
                ),
              },
            }));
          }
          removePendingHistoryAction(action.id);
        } catch (err) {
          if (action.kind === 'delete' && isHttpStatusError(err, 404)) {
            // Server no longer has this item for current owner: treat as already synced.
            removePendingHistoryAction(action.id);
            continue;
          }
          // keep queued for next reconnect
        }
      }
    };
    flushPendingHistory();
    return () => {
      cancelled = true;
    };
  }, [syncTick, backendUserId, setState]);

  // GET /api/looks — наш бэкенд: optionalAuth, ответ { looks: [{ id, imageUrl, ... }] }
  useEffect(() => {
    const fetchLooks = async () => {
      try {
        const token = localStorage.getItem('tvoiisty_token');
        const res = await fetch(`${API_BASE}/api/looks`, {
          headers: getOwnerHeaders(backendUserId, token),
        });
        updateBackendUserIdFromHeaders(res);
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
  }, [backendUserId, syncTick]);

  // GET /api/my/photos — owner-based список (лимит 10)
  useEffect(() => {
    const fetchMyPhotos = async () => {
      try {
        const token = localStorage.getItem('tvoiisty_token');
        const res = await fetch(`${API_BASE}/api/my/photos`, {
          headers: getOwnerHeaders(backendUserId, token),
        });
        updateBackendUserIdFromHeaders(res);
        if (!res.ok && res.status !== 404) return;
        if (res.status === 404) return;
        const data = await res.json();
        const urls: string[] = Array.isArray(data)
          ? data.map((x: any) => String(x.url)).filter(Boolean)
          : [];
        setState(prev => {
          const existing = prev.auth?.userPhotos || [];
          // Сначала оставляем уже видимые в UI фото (в т.ч. только что загруженные), потом дополняем сервером.
          const merged = Array.from(new Set([...existing, ...urls])).slice(0, 10);
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
  }, [backendUserId, setState, syncTick]);

  // GET /api/history — owner-based история (лимит 50)
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('tvoiisty_token');
        const headers = getOwnerHeaders(backendUserId, token);
        const res = await fetch(`${API_BASE}/api/history`, { headers });
        updateBackendUserIdFromHeaders(res);
        if (!res.ok) {
          if (res.status === 401) return;
          return;
        }
        const data = await res.json();
        if (!Array.isArray(data)) return;
        const items = normalizeHistoryRows(data);
        const pendingDeleteIds = new Set(
          getPendingHistoryActions()
            .filter((x) => x.kind === 'delete')
            .map((x) => x.sessionId),
        );
        setState(prev => ({
          ...prev,
          auth: {
            ...prev.auth,
            lookHistory: Array.from(
              new Map(
                [...items, ...(prev.auth?.lookHistory || [])]
                  .map((item: any) => [String(item.id || `${item.imageUrl}_${item.timestamp}`), item]),
              ).values(),
            )
              .sort((a: any, b: any) => {
                const aNew = !!a.isNew;
                const bNew = !!b.isNew;
                if (aNew && !bNew) return -1;
                if (!aNew && bNew) return 1;
                const aLiked = !!a.liked;
                const bLiked = !!b.liked;
                if (aLiked && !bLiked) return -1;
                if (!aLiked && bLiked) return 1;
                return Number(b.timestamp || 0) - Number(a.timestamp || 0);
              })
              .filter((x: any) => !pendingDeleteIds.has(String(x.id)))
              .slice(0, 50),
          },
        }));
      } catch (err) {
        console.error('history load error', err);
        logError('HISTORY', err);
      }
    };
    fetchHistory();
  }, [backendUserId, setState, syncTick]);

  useEffect(() => {
    try {
      // Не сохраняем heavy data: URL в localStorage — это может выбивать quota (особенно в Telegram WebView).
      const persistableState: AppState = {
        ...state,
        auth: {
          ...state.auth,
          userPhotos: (state.auth?.userPhotos || []).filter(
            (u) => typeof u === 'string' && !u.startsWith('data:'),
          ),
          garmentMemory: (state.auth?.garmentMemory || []).filter(
            (u) => typeof u === 'string' && !u.startsWith('data:'),
          ),
          lookHistory: (state.auth?.lookHistory || [])
            .filter((h: any) => h && typeof h.imageUrl === 'string' && !h.imageUrl.startsWith('data:'))
            .slice(0, 50),
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
    } catch (err) {
      // Мягко игнорируем ошибки персистентности, чтобы не ронять интерфейс.
      logError('PERSISTENCE', err);
    }
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

      const token = localStorage.getItem('tvoiisty_token');
      const headers: Record<string, string> = getOwnerHeaders(backendUserId, token);

      const res = await uploadImage({ apiBase: API_BASE, headers, formData });
      updateBackendUserIdFromHeaders(res);
      const data = await res.json();
      // Наш бэкенд возвращает assetId и url
      const id = (data?.assetId ?? data?.id) ? String(data.assetId ?? data.id) : null;
      const url = data?.url ? String(data.url) : '';
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

  const imageToBlob = async (img: string): Promise<Blob> => {
    if (!img) throw new Error('empty-image');
    if (img.startsWith('http://') || img.startsWith('https://')) {
      const r = await fetch(img, { mode: 'cors' });
      if (!r.ok) throw new Error(`fetch-image-${r.status}`);
      return r.blob();
    }
    if (img.startsWith('data:')) {
      const base64 = img.includes(',') ? img.split(',')[1] : '';
      if (!base64) throw new Error('invalid-data-url');
      const binary = atob(base64.replace(/\s/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const mime = img.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
      return new Blob([bytes], { type: mime });
    }
    throw new Error('unsupported-image-format');
  };

  const handleUserPhotoUpload = (img: string) => {
    setUserPhoto(img);

    // Сразу показываем фото в "Мои фото" (моментальный отклик для пользователя).
    setState(prev => {
      const userPhotos = prev.auth?.userPhotos || [];
      const next = [img, ...userPhotos];
      const limited = next.slice(0, 10); // лимит 10 фото
      return {
        ...prev,
        auth: { ...prev.auth, userPhotos: limited, selectedUserPhoto: img },
      };
    });

    // Параллельно отправляем в backend и, если вернулся URL, заменяем base64 на стабильный URL.
    uploadUserPhotoToBackend(img).then((uploaded) => {
      if (!uploaded) {
        enqueuePendingPersonUpload(img);
        return;
      }
      const url = uploaded.url;
      setState(prev => {
        const userPhotos = prev.auth?.userPhotos || [];
        const replaced = userPhotos.map(p => (p === img ? url : p));
        const unique = Array.from(new Set(replaced));
        return {
          ...prev,
          auth: { ...prev.auth, userPhotos: unique.slice(0, 10), selectedUserPhoto: url },
        };
      });
    });
  };

  const handleTryOn = async (garment: string, photoOverride?: string) => {
    if (isAnyProcessing) {
      // Prevent parallel try-on/video operations from overlapping.
      return;
    }

    const effectivePhoto = photoOverride ?? userPhoto;

    if (!effectivePhoto) {
      // Нет фото — запоминаем образ и отправляем на шаг "Мои фото"
      setPendingGarment(garment);
      setCurrentStep(1);
      return;
    }

    if (!garment) return;

    // запоминаем активное фото пользователя для последующих заходов
    setState(prev => ({
      ...prev,
      auth: { ...prev.auth, selectedUserPhoto: effectivePhoto },
    }));

    setGarmentPhoto(garment);
    setTryonError(null);
    setIsProcessing(true);
    setResultImage(null);
    setResultVideo(null);
    setResultId(null);
    setCurrentStep(3);
    
    try {
      // cancel any previous try-on
      if (tryonAbortRef.current) {
        tryonAbortRef.current.abort();
      }
      const tryonController = new AbortController();
      tryonAbortRef.current = tryonController;

      const personBlob = await imageToBlob(effectivePhoto);
      const garmentBlob = await imageToBlob(garment);
      if (tryonController.signal.aborted) return;

      const { imageUrl, sessionId } = await startTryOnLite({
        apiBase: API_BASE,
        person: personBlob,
        garment: garmentBlob,
        headers: getOwnerHeaders(backendUserId, localStorage.getItem('tvoiisty_token')),
      });

      const newId = sessionId || `${Date.now()}`;
      setResultId(newId);
      setResultImage(imageUrl);
      setState(prev => {
        const history = prev.auth?.lookHistory || [];
        return {
          ...prev,
          auth: {
            ...prev.auth,
            lookHistory: [{ id: newId, imageUrl, timestamp: Date.now(), isNew: true }, ...history.slice(0, 49)],
          },
        };
      });
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
    tryonAbortRef.current?.abort();
    videoAbortRef.current?.abort();
  };

  const handleCreateVideo = async () => {
    if (!resultImage) return;
    setIsProcessing(true);
    try {
      // cancel any previous video request
      if (videoAbortRef.current) {
        videoAbortRef.current.abort();
      }
      const videoController = new AbortController();
      videoAbortRef.current = videoController;
      const { videoUrl } = await startVideoFromImage({
        apiBase: API_BASE,
        imageUrl: resultImage,
        headers: getOwnerHeaders(backendUserId, localStorage.getItem('tvoiisty_token')),
      });
      if (videoController.signal.aborted) return;
      handleVideoCreated(videoUrl);
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
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={() => { setIsQuickLite(true); }}
                className="px-10 py-5 bg-white text-slate-900 rounded-full font-semibold text-xs uppercase tracking-[0.2em] shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all active:scale-95 border border-slate-100"
              >
                {t.quickTryon}
              </button>
              <button 
                onClick={handleStart}
                className="px-10 py-5 bg-transparent text-slate-500 rounded-full font-semibold text-xs uppercase tracking-[0.2em] hover:text-slate-900 transition-all active:scale-95"
              >
                {t.findStyle}
              </button>
            </div>
            <div className="mt-20 animate-bounce opacity-20">
              <span className="text-xl">↓</span>
            </div>
          </div>
        );
      case 1:
        return (
          <>
            {pendingGarment && (
              <div className="fixed top-[72px] inset-x-0 z-50 flex justify-center px-6 pointer-events-none">
                <div className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-widest px-5 py-3 rounded-full shadow-2xl flex items-center gap-2">
                  <span className="text-[var(--primary)]">◎</span>
                  Выберите своё фото — примерка запустится автоматически
                </div>
              </div>
            )}
            <UploadBox
              key="step1-user"
              onUploadNew={(img) => {
                handleUserPhotoUpload(img);
                if (pendingGarment) {
                  const garment = pendingGarment;
                  setPendingGarment(null);
                  // Небольшая задержка чтобы state успел обновиться
                  setTimeout(() => handleTryOn(garment, img), 50);
                }
              }}
              onSelectPhoto={(url) => {
                setUserPhoto(url);
                setState(prev => ({
                  ...prev,
                  auth: { ...prev.auth, selectedUserPhoto: url },
                }));
                if (pendingGarment) {
                  const garment = pendingGarment;
                  setPendingGarment(null);
                  handleTryOn(garment, url);
                } else {
                  setCurrentStep(2);
                }
              }}
              t={t}
              state={state}
              setState={setState}
            />
          </>
        );
      case 2:
        return (
          <UploadBox
            key="step2-gallery"
            onUpload={handleTryOn} 
            t={t} 
            state={state}
            setState={setState}
            backendLooks={backendLooks}
            disableTryOnActions={isAnyProcessing}
          />
        );
      case 3:
        return <ResultView 
          image={resultImage} 
          isProcessing={isProcessing} 
          onCreateVideo={() => {
            setCurrentStep(4);
            handleCreateVideo();
          }}
          onReset={() => setCurrentStep(5)}
          error={tryonError}
          onRetry={handleRetryTryOn}
          onChooseAnother={() => {
            if (isAnyProcessing) return;
            setCurrentStep(2);
          }}
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
          onLike={async (sessionId, liked) => {
            setState((prev) => ({
              ...prev,
              auth: {
                ...prev.auth,
                lookHistory: (prev.auth.lookHistory || []).map((x) =>
                  x.id === sessionId ? { ...x, liked } : x,
                ),
              },
            }));
            try {
              await setHistoryLike({ apiBase: API_BASE, headers: getApiHeaders() }, sessionId, liked);
            } catch {
              enqueueHistoryLike(sessionId, liked);
            }
          }}
          onDelete={async (sessionId) => {
            const removeLocal = () => {
              setState((prev) => ({
                ...prev,
                auth: {
                  ...prev.auth,
                  lookHistory: (prev.auth.lookHistory || []).filter((x) => x.id !== sessionId),
                },
              }));
            };
            try {
              await deleteHistoryItem({ apiBase: API_BASE, headers: getApiHeaders() }, sessionId);
              removeLocal();
            } catch (err) {
              removeLocal();
              if (isHttpStatusError(err, 404)) return;
              enqueueHistoryDelete(sessionId);
              // Trigger a near-term retry even if network state did not toggle.
              setSyncTick((v) => v + 1);
            }
          }}
          onReanimate={async (sessionId) => {
            // Сразу очищаем старое видео — пользователь видит что идёт новая анимация
            setState((prev) => ({
              ...prev,
              auth: {
                ...prev.auth,
                lookHistory: (prev.auth.lookHistory || []).map((x) =>
                  x.id === sessionId ? { ...x, videoUrl: undefined } : x,
                ),
              },
            }));
            try {
              const { videoUrl } = await reanimateHistoryItem(
                { apiBase: API_BASE, headers: getApiHeaders() },
                sessionId,
              );
              setState((prev) => ({
                ...prev,
                auth: {
                  ...prev.auth,
                  lookHistory: (prev.auth.lookHistory || []).map((x) =>
                    x.id === sessionId ? { ...x, videoUrl } : x,
                  ),
                },
              }));
            } catch {
              enqueueHistoryReanimate(sessionId);
            }
          }}
          onViewed={async (ids) => {
            try {
              await markHistoryViewed({ apiBase: API_BASE, headers: getApiHeaders() }, ids);
            } catch {
              // сервер обновится при следующем успешном sync
            }
          }}
        />;
      default:
        return null;
    }
  };

  const renderView = () => {
    if (isQuickLite && view === 'home') {
      return (
        <QuickTryOnLite
          t={t}
          onBusyChange={setIsQuickProcessing}
          onResult={(sessionId: string, imageUrl: string) => {
            setState(prev => {
              const history = prev.auth?.lookHistory || [];
              return {
                ...prev,
                auth: {
                  ...prev.auth,
                  lookHistory: [
                    { id: sessionId, imageUrl, timestamp: Date.now(), isNew: true },
                    ...history.filter(h => h.id !== sessionId).slice(0, 49),
                  ],
                },
              };
            });
            setHasNewHistoryFromQuick(true);
          }}
          onVideoResult={(sessionId: string, videoUrl: string) => {
            setState(prev => ({
              ...prev,
              auth: {
                ...prev.auth,
                lookHistory: (prev.auth?.lookHistory || []).map(item =>
                  item.id === sessionId ? { ...item, videoUrl } : item
                ),
              },
            }));
          }}
        />
      );
    }
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
        isQuickLite={isQuickLite}
        setIsQuickLite={setIsQuickLite}
        hasNewHistory={hasNewHistoryFromQuick}
        onHistoryViewed={() => setHasNewHistoryFromQuick(false)}
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
