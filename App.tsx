
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { Lab } from './components/Lab';
import { AdminPanel } from './components/AdminPanel';
import { prepareTryonPrompt, generateTryOn, generateVideo } from './services/geminiService';
import {
  getDefaultImageModel,
  getDefaultVideoModel,
  getImageModelsForDropdown,
  getVideoModelsForDropdown,
  showImageModelDropdown,
  showVideoModelDropdown,
  showModelChoiceOnHome,
  getEffectiveImagePrompt,
  getEffectiveVideoPrompt,
  getImageFallbackEnabled,
} from './services/adminSettings';
import { TryOnState, User, CuratedOutfit, PersonGalleryItem, HistoryItem, AppTheme, CategoryType } from './types';
import { getHistory, saveHistory, ARCHIVE_MAX_ITEMS } from './services/historyStorage';
import { getMerchantProducts, saveMerchantProducts } from './services/merchantProductsStorage';
import { getCompressedByUrl, saveCompressedByUrl } from './services/compressedUrlStorage';
import { getMetrics, incrementMetric, resetMetrics, type AppMetrics } from './services/metricsStorage';
import { resizeDataUrl, resizeDataUrlForStorage } from './lib/resizeImage';
import {
  SOCIAL_PLATFORMS,
  loadSocialConnections,
  saveSocialConnections,
  createDefaultSocialConnections,
  type SocialConnectionsState,
  type SocialPlatformId,
} from './services/socials';

const INITIAL_BOUTIQUE: CuratedOutfit[] = [
  { id: 'w1', name: 'Шелковое платье Emerald', imageUrl: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?q=80&w=600', shopUrl: 'https://zara.com', category: 'dresses' },
  { id: 'w2', name: 'Летний сарафан Linen', imageUrl: 'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?q=80&w=600', shopUrl: 'https://mango.com', category: 'casual' },
  { id: 'm1', name: 'Пиджак Royal Blue', imageUrl: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?q=80&w=600', shopUrl: 'https://asos.com', category: 'suits' },
  { id: 'm2', name: 'Свитер Cashmere', imageUrl: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?q=80&w=600', shopUrl: 'https://nike.com', category: 'outerwear' },
];

const CATEGORIES: { id: CategoryType; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'dresses', label: 'Платья' },
  { id: 'suits', label: 'Костюмы' },
  { id: 'casual', label: 'Casual' },
  { id: 'outerwear', label: 'Верхняя одежда' },
];

const OUTFITS_PAGE_SIZE = 8;

const App: React.FC = () => {
  const STORAGE_VER = "v29_business_ready";
  
  const [user, setUser] = useState<User | null>(null);
  const [personGallery, setPersonGallery] = useState<PersonGalleryItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [merchantProducts, setMerchantProducts] = useState<CuratedOutfit[]>([]);
  const [testClothes, setTestClothes] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'settings' | 'showroom' | 'lab' | 'admin'>('home');
  const [outfitPage, setOutfitPage] = useState(1);
  const [adminUnlockedSession, setAdminUnlockedSession] = useState(false);
  /** Кто ввёл 888 в этой сессии — показываем шестерёнку в шапке для быстрого перехода в настройки. */
  const [adminSessionUnlocked, setAdminSessionUnlocked] = useState(() => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('tvoisty_admin_unlocked') === '1');
  const [activeCategory, setActiveCategory] = useState<CategoryType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [authModal, setAuthModal] = useState(false);
  const [verificationModal, setVerificationModal] = useState(false);
  const [addProductModal, setAddProductModal] = useState(false);
  const [socialModal, setSocialModal] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  
  const [newProduct, setNewProduct] = useState({ name: '', image: '', category: 'casual' as CategoryType, shopUrl: '' });
  const [stylistModalOpen, setStylistModalOpen] = useState(false);
  const [collectionUploadOpen, setCollectionUploadOpen] = useState(false);
  const [collectionImages, setCollectionImages] = useState<string[]>([]);
  const [collectionForm, setCollectionForm] = useState({ name: '', shopUrl: '', category: 'casual' as CategoryType });
  
  const [state, setState] = useState<TryOnState & { currentShopUrl: string | null }>({
    personImage: null,
    outfitImage: null,
    resultImage: null,
    currentShopUrl: null,
    isProcessing: false,
    status: '',
    error: null,
  });

  /** URL готового видео (после «Создать видео»). Один клик = один вызов API. */
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  const [isVideoProcessing, setIsVideoProcessing] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  /** Модель для примерки и для видео — из настроек админки или пул по умолчанию. */
  const [selectedImageModel, setSelectedImageModel] = useState<string>(getDefaultImageModel());
  const [selectedVideoModel, setSelectedVideoModel] = useState<string>(getDefaultVideoModel());
  /** Видео, созданное из фото в архиве (в модалке просмотра). */
  const [archiveVideoUrl, setArchiveVideoUrl] = useState<string | null>(null);
  const [archiveVideoError, setArchiveVideoError] = useState<string | null>(null);
  const [isArchiveVideoProcessing, setIsArchiveVideoProcessing] = useState(false);
  /** Показан ли тост о переполнении архива за эту сессию (не спамить). */
  const [archiveOverflowToastShown, setArchiveOverflowToastShown] = useState(false);
  /** Локальные метрики (Issue #29). */
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  /** Подключённые соцсети (Issue #31). */
  const [socialConnections, setSocialConnections] = useState<SocialConnectionsState>(createDefaultSocialConnections());
  /** Тултип при клике на неактивную соцсеть в веере. */
  const [shareTooltip, setShareTooltip] = useState<string | null>(null);
  /** URL карточек, по которым уже запущена загрузка+сжатие (чтобы не дублировать). */
  const loadingUrls = useRef<Set<string>>(new Set());

  const initUser = () => {
    const guest: User = { 
      name: 'Гость', avatar: '', isRegistered: false, tryOnCount: 0, 
      role: 'user', isVerifiedMerchant: false, theme: 'turquoise' 
    };
    setUser(guest);
    document.body.className = `theme-${guest.theme}`;
    localStorage.setItem(`${STORAGE_VER}_user`, JSON.stringify(guest));
  };

  useEffect(() => {
    try {
      const savedPersonGallery = localStorage.getItem(`${STORAGE_VER}_person_gallery`);
      if (savedPersonGallery) setPersonGallery(JSON.parse(savedPersonGallery));
      getHistory(`${STORAGE_VER}_history`).then(setHistory);
      getMetrics().then(setMetrics);
      getMerchantProducts(`${STORAGE_VER}_merchant_products`).then(setMerchantProducts);
      setSocialConnections(loadSocialConnections(`${STORAGE_VER}_social_connections`));
      const savedTestClothes = localStorage.getItem(`${STORAGE_VER}_test_clothes`);
      if (savedTestClothes) setTestClothes(savedTestClothes);
      
      const savedUser = localStorage.getItem(`${STORAGE_VER}_user`);
      if (savedUser) {
        const u = JSON.parse(savedUser);
        setUser(u);
        document.body.className = `theme-${u.theme}`;
      } else {
        initUser();
      }
    } catch (e) { 
      console.error(e);
      initUser();
    }
  }, []);

  const saveToStorage = (key: string, data: any) => {
    try { 
      const val = typeof data === 'string' ? data : JSON.stringify(data);
      localStorage.setItem(`${STORAGE_VER}_${key}`, val); 
    } catch (e) {}
  };

  /** Статистика по товарам магазина (локально, по merchantProducts). */
  const totalShopTryOns = useMemo(
    () => merchantProducts.reduce((sum, p) => sum + (p.stats?.tryOns ?? 0), 0),
    [merchantProducts],
  );
  const totalShopClicks = useMemo(
    () => merchantProducts.reduce((sum, p) => sum + (p.stats?.clicks ?? 0), 0),
    [merchantProducts],
  );

  const filteredOutfits = useMemo(() => {
    let all = [...merchantProducts, ...INITIAL_BOUTIQUE];
    if (activeCategory !== 'all') {
      all = all.filter(o => o.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      all = all.filter(o => o.name.toLowerCase().includes(q));
    }
    return all;
  }, [activeCategory, searchQuery, merchantProducts]);

  const handleQuickTryOn = async (outfitUrl: string, shopUrl: string = '#') => {
    if (!state.personImage) {
      setState(prev => ({ ...prev, error: 'Сначала фото (Шаг 01)' }));
      setTimeout(() => setState(p => ({ ...p, error: null })), 3000);
      return;
    }
    if (!user?.isRegistered) { setAuthModal(true); return; }

    setState(prev => ({
      ...prev,
      outfitImage: outfitUrl,
      currentShopUrl: shopUrl,
      isProcessing: true,
      status: 'Анализ стиля...',
      error: null,
      resultImage: null,
    }));
    setResultVideoUrl(null);
    setVideoError(null);
    try {
      // Инвариант: только готовые данные из хранилища. Никакого resize/загрузки по URL здесь.
      const personBase64 = state.personImage!;
      let outfitBase64: string;
      if (outfitUrl.startsWith('data:')) {
        outfitBase64 = outfitUrl;
      } else {
        const stored = await getCompressedByUrl(outfitUrl);
        if (!stored) {
          setState((prev) => ({ ...prev, isProcessing: false, error: 'Дождитесь загрузки изображения', status: '' }));
          setTimeout(() => setState((p) => ({ ...p, error: null })), 3000);
          return;
        }
        outfitBase64 = stored;
      }
      setState(prev => ({ ...prev, status: 'Подготовка промпта...' }));
      const prompt = await getEffectiveImagePrompt(() => prepareTryonPrompt(personBase64, outfitBase64));
      setState(prev => ({ ...prev, status: 'Примеряем образ...' }));
      const imageModel = showImageModelDropdown() ? selectedImageModel : getDefaultImageModel();
      const imageUrl = await generateTryOn(personBase64, outfitBase64, prompt, { model: imageModel, fallbackOnError: getImageFallbackEnabled() });
      setState(prev => ({ ...prev, resultImage: imageUrl, isProcessing: false, status: '' }));
      // Локальная статистика магазина: считаем примерки по товарам мерчанта.
      if (shopUrl && shopUrl !== '#') {
        const updatedProducts = merchantProducts.map(p =>
          p.imageUrl === outfitUrl && p.shopUrl === shopUrl
            ? {
                ...p,
                stats: {
                  tryOns: (p.stats?.tryOns ?? 0) + 1,
                  clicks: p.stats?.clicks ?? 0,
                },
              }
            : p,
        );
        if (updatedProducts !== merchantProducts) {
          setMerchantProducts(updatedProducts);
          saveToStorage('merchant_products', updatedProducts);
        }
      }
      if (!imageUrl.startsWith('data:')) {
        incrementMetric('totalTryOns').then(() => incrementMetric('totalArchiveSaves')).then(() => getMetrics().then(setMetrics));
        const newItem: HistoryItem = { id: `h_${Date.now()}`, resultUrl: imageUrl, outfitUrl, shopUrl, timestamp: Date.now() };
        const prevLen = history.length;
        const newHistory = [newItem, ...history].slice(0, ARCHIVE_MAX_ITEMS);
        const didOverflow = prevLen >= ARCHIVE_MAX_ITEMS;
        setHistory(newHistory);
        saveHistory(newHistory, `${STORAGE_VER}_history`);
        if (didOverflow && !archiveOverflowToastShown) {
          setArchiveOverflowToastShown(true);
          setSuccessMsg(`В архиве хранятся последние ${ARCHIVE_MAX_ITEMS} примерок. Самая старая запись удалена.`);
          setTimeout(() => setSuccessMsg(null), 4000);
        }
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      const isNetwork = /failed to fetch|network error|load failed/i.test(raw) || raw === '';
      const msg = isNetwork
        ? 'Нет связи с сервером. Проверьте интернет и попробуйте снова.'
        : (raw || 'ИИ перегружен, попробуйте снова');
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
      setTimeout(() => setState(p => ({ ...p, error: null })), 5000);
    }
  };

  /** Загрузили картинку по URL → сразу сжали → сохранили в IndexedDB. Handler примерки только читает оттуда. */
  const loadThenCompressAndStore = (url: string) => {
    if (!url.startsWith('http') || loadingUrls.current.has(url)) return;
    loadingUrls.current.add(url);
    urlToBase64(url)
      .then(resizeDataUrlForStorage)
      .then((c) => saveCompressedByUrl(url, c))
      .catch(() => {})
      .finally(() => { loadingUrls.current.delete(url); });
  };

  /** URL или data URL → base64/data URL для API. Не уменьшаем: фото уже адаптированы при загрузке; повторно не жмём. */
  const urlToBase64 = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (url.startsWith('data:')) return resolve(url);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          try { resolve(canvas.toDataURL('image/png', 0.9)); } catch (e) { reject(e); }
        } else { reject(new Error('Canvas context')); }
      };
      img.onerror = () => reject(new Error('Ошибка загрузки'));
      img.src = url;
    });
  };

  /** Один клик = один вызов API генерации видео. Без авто-повторов. Видео в архив не сохраняем — пока нет бэка/БД. */
  const handleCreateVideo = async () => {
    if (!state.resultImage) return;
    setIsVideoProcessing(true);
    setVideoError(null);
    try {
      const videoModel = showVideoModelDropdown() ? selectedVideoModel : getDefaultVideoModel();
      const videoPrompt = getEffectiveVideoPrompt();
      const videoUrl = await generateVideo(state.resultImage, { model: videoModel, prompt: videoPrompt });
      setResultVideoUrl(videoUrl);
      incrementMetric('totalVideos').then(() => getMetrics().then(setMetrics));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось создать видео. Попробуйте снова.';
      setVideoError(msg);
    } finally {
      setIsVideoProcessing(false);
    }
  };

  /** Скачать видео по URL (fetch + blob для кросс-домена). */
  const handleDownloadVideo = async () => {
    if (!resultVideoUrl) return;
    try {
      const res = await fetch(resultVideoUrl, { mode: 'cors' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `look_video_${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(resultVideoUrl, '_blank');
    }
  };

  const openInStore = (url: string) => {
    if (!url || url === '#') {
       setSuccessMsg("Ссылка на магазин не указана");
       setTimeout(() => setSuccessMsg(null), 2000);
       return;
    }
    incrementMetric('totalShopClicks').then(() => getMetrics().then(setMetrics));
    // Локальная статистика: считаем клики по товарам магазина.
    const updated = merchantProducts.map(p =>
      p.shopUrl === url
        ? {
            ...p,
            stats: {
              tryOns: p.stats?.tryOns ?? 0,
              clicks: (p.stats?.clicks ?? 0) + 1,
            },
          }
        : p,
    );
    if (updated !== merchantProducts) {
      setMerchantProducts(updated);
      saveToStorage('merchant_products', updated);
    }
    window.open(url, '_blank');
  };

  const goToTab = (tab: 'home' | 'history' | 'settings' | 'showroom' | 'lab') => {
    setActiveTab(tab);
    if (tab === 'home') {
      setState(s => ({ ...s, resultImage: null, error: null }));
      setResultVideoUrl(null);
      setIsVideoProcessing(false);
      setVideoError(null);
    }
  };

  const handleReset = () => {
    if (window.confirm("Вы уверены, что хотите сбросить все данные? Это удалит вашу историю и настройки.")) {
      localStorage.clear();
      setPersonGallery([]);
      setHistory([]);
      setMerchantProducts([]);
      setTestClothes(null);
      setState({ personImage: null, outfitImage: null, resultImage: null, currentShopUrl: null, isProcessing: false, status: '', error: null });
      setResultVideoUrl(null);
      setIsVideoProcessing(false);
      setVideoError(null);
      initUser();
      goToTab('home');
      setSuccessMsg("Данные сброшены");
      setTimeout(() => setSuccessMsg(null), 2000);
    }
  };

  return (
    <div className={`app-container flex flex-col h-screen overflow-hidden`}>
      {/* Loader */}
      {state.isProcessing && (
        <div className="fixed inset-0 z-[200] bg-white/95 backdrop-blur-3xl flex flex-col items-center justify-center p-12">
           <div className="w-16 h-16 border-[5px] border-theme border-t-transparent rounded-full animate-spin mb-8 shadow-2xl"></div>
           <h2 className="serif text-2xl font-black italic text-theme text-center">{state.status}</h2>
           <p className="text-[9px] font-bold text-gray-400 mt-4 uppercase tracking-[0.2em] animate-pulse">ИИ создает ваш идеальный образ</p>
        </div>
      )}

      {/* Nav */}
      <nav className="glass px-6 py-5 flex items-center justify-between sticky top-0 z-40 border-b border-gray-100/30">
        <div className="flex flex-col cursor-pointer active:scale-95 transition-transform" onClick={() => goToTab('home')}>
          <div className="flex items-center gap-1">
            <h1 className="serif text-xl tracking-tighter font-black uppercase leading-none">тво<span className="text-theme">ИИ</span>стиль</h1>
            {user?.isVerifiedMerchant && (
              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.64.304 1.24.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            )}
          </div>
          <p className="text-[7px] font-bold uppercase tracking-[0.3em] text-gray-400 mt-1">Digital Atelier</p>
        </div>
        <div className="flex items-center gap-5">
          {adminSessionUnlocked && (
            <button onClick={() => goToTab('settings')} className={`${activeTab === 'settings' ? 'text-theme' : 'text-gray-400'} transition-all hover:scale-110`} title="Настройки" aria-label="Настройки">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </button>
          )}
          {user?.isVerifiedMerchant && (
            <button onClick={() => goToTab('showroom')} className={`${activeTab === 'showroom' ? 'text-theme' : 'text-gray-300'} transition-all hover:scale-110`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            </button>
          )}
          <button onClick={() => goToTab('history')} className={`${activeTab === 'history' ? 'text-theme' : 'text-gray-300'} transition-all hover:scale-110`}>
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
          </button>
          <button onClick={() => goToTab('settings')} className={`w-9 h-9 rounded-full border-2 ${activeTab === 'settings' ? 'border-theme scale-110' : 'border-gray-100'} overflow-hidden shadow-xl transition-all`}>
            <img src={personGallery[0]?.imageUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Style'} className="w-full h-full object-cover" />
          </button>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
        {state.resultImage ? (
          <div className="p-7 space-y-8 animate-in slide-in-from-bottom-10">
             {/* Результат примерки: целиком в кадре (голова не обрезается), скролл при необходимости */}
             <div className="relative rounded-[3.5rem] overflow-hidden shadow-4xl border-[10px] border-white ring-1 ring-gray-100 bg-gray-50 flex items-center justify-center" style={{ maxHeight: 'min(75vh, 900px)' }}>
                <img src={state.resultImage} className="w-full max-h-[min(75vh,900px)] object-contain" alt="Результат примерки" />
             </div>

             {/* Главные действия сразу под картинкой — всегда видны */}
             <button 
               onClick={() => openInStore(state.currentShopUrl!)} 
               className="w-full py-5 rounded-3xl font-black text-[12px] uppercase tracking-widest shadow-2xl active:scale-95 flex items-center justify-center gap-3 bg-[var(--theme-color)] text-white border-2 border-[var(--theme-color)] ring-2 ring-black/10"
             >
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
               Купить в магазине
             </button>

             {/* Выбор модели для видео: на главном только если локально включено. */}
             <div className="space-y-3">
               {showVideoModelDropdown() && showModelChoiceOnHome() && (
                 <div>
                   <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Модель для видео</label>
                   <select value={selectedVideoModel} onChange={e => setSelectedVideoModel(e.target.value)} className="w-full py-3 px-4 rounded-2xl bg-white border-2 border-gray-100 text-[10px] font-bold uppercase tracking-wide outline-none focus:border-theme">
                     {getVideoModelsForDropdown().map(m => <option key={m} value={m}>{m}</option>)}
                   </select>
                 </div>
               )}
               <button
                 onClick={handleCreateVideo}
                 disabled={isVideoProcessing}
                 className="w-full py-5 bg-white border-2 border-theme text-theme rounded-3xl font-black text-[12px] uppercase tracking-widest shadow-xl active:scale-95 flex items-center justify-center gap-3 disabled:opacity-60"
               >
                 {isVideoProcessing ? (
                   <>Создаём видео...</>
                 ) : (
                   <>
                     <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/><path d="M4 5h2v14H4z"/></svg>
                     Создать видео
                   </>
                 )}
               </button>
               {videoError && (
                 <p className="text-red-500 text-[10px] font-bold text-center">
                   {videoError}
                   <button type="button" onClick={handleCreateVideo} className="block mx-auto mt-2 underline">Повторить</button>
                 </p>
               )}
               {resultVideoUrl && (
                 <>
                   <div className="rounded-[3rem] overflow-hidden border-4 border-white shadow-xl bg-black">
                     <div className="aspect-[9/16] max-h-[70vh] w-full mx-auto">
                       <video src={resultVideoUrl} controls className="w-full h-full object-contain" playsInline />
                     </div>
                   </div>
                   <button onClick={handleDownloadVideo} title="Удалось? Отправьте в Telegram или скачайте. В MVP в архиве только последние примерки — доработаем." className="w-full py-3 bg-white border border-gray-100 rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg active:scale-95">
                     Скачать видео
                   </button>
                 </>
               )}
             </div>

             <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleDownload(state.resultImage!)} className="py-4 bg-white border border-gray-200 rounded-3xl font-black text-[9px] uppercase tracking-widest shadow-xl active:scale-95 text-gray-800">Скачать</button>
                <button onClick={() => { incrementMetric('totalShares').then(() => getMetrics().then(setMetrics)); setSocialModal(state.resultImage); }} className="py-4 bg-white border border-gray-200 rounded-3xl font-black text-[9px] uppercase tracking-widest shadow-xl active:scale-95 text-gray-800">Поделиться</button>
                <button onClick={() => { setState(s => ({ ...s, resultImage: null })); setResultVideoUrl(null); setVideoError(null); }} className="col-span-2 py-4 text-gray-500 font-black text-[9px] uppercase tracking-widest active:scale-95">Примерить другое</button>
             </div>
          </div>
        ) : (
          <div className="space-y-6">
            {activeTab === 'home' ? (
              <div className="space-y-8 px-6 py-6">
                {/* Step 1: Person Selection */}
                <div className="space-y-4">
                  <div className="flex justify-between items-end px-1"><h3 className="serif text-2xl font-black italic">Ваше фото</h3><span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Шаг 01</span></div>
                  <div className="flex gap-4 overflow-x-auto no-scrollbar py-2">
                    <div className="flex-shrink-0 w-24 h-32">
                      <ImageUploader label="Добавить" image={null} onImageSelect={(img) => { 
                        const updated = [{id:`p_${Date.now()}`, imageUrl:img}, ...personGallery].slice(0, 5); 
                        setPersonGallery(updated); 
                        saveToStorage('person_gallery', updated); 
                        setState(p=>({...p, personImage:img})); 
                      }} icon={<svg className="w-8 h-8 text-theme" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>} />
                    </div>
                    {personGallery.map(item => (
                      <button key={item.id} onClick={() => setState(s=>({...s, personImage:item.imageUrl}))} className={`flex-shrink-0 w-24 h-32 rounded-[2rem] overflow-hidden border-4 transition-all ${state.personImage === item.imageUrl ? 'border-theme shadow-3xl scale-105' : 'border-white opacity-80'}`}>
                        <img src={item.imageUrl} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2: Catalog with Search & Filter */}
                <div className="space-y-6">
                  <div className="flex justify-between items-end px-1"><h3 className="serif text-2xl font-black italic">Витрина</h3><span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Шаг 02</span></div>
                  {/* Выбор модели: на главном только если локально включено «показывать на главном». Иначе — только в Лаборатории. */}
                  {showImageModelDropdown() && showModelChoiceOnHome() ? (
                    <div>
                      <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Модель для примерки</label>
                      <select value={selectedImageModel} onChange={e => setSelectedImageModel(e.target.value)} className="w-full py-3 px-4 rounded-2xl bg-white border-2 border-gray-100 text-[10px] font-bold uppercase tracking-wide outline-none focus:border-theme">
                        {getImageModelsForDropdown().map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  ) : null}
                  {/* Search Bar */}
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Поиск по названию..." 
                      className="w-full py-4 px-6 pr-12 rounded-2xl bg-white border border-gray-100 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-theme shadow-sm transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <svg className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  </div>

                  {/* Category Filter */}
                  <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                    {CATEGORIES.map(cat => (
                      <button 
                        key={cat.id} 
                        onClick={() => setActiveCategory(cat.id)}
                        className={`flex-shrink-0 px-6 py-3 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${activeCategory === cat.id ? 'bg-theme text-white shadow-lg scale-105' : 'bg-white text-gray-400 border border-gray-100'}`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Dynamic Grid with lazy \"Показать ещё\" */}
                  <div className="grid grid-cols-2 gap-5 min-h-[400px]">
                    {filteredOutfits
                      .slice(0, outfitPage * OUTFITS_PAGE_SIZE)
                      .map(outfit => (
                        <div key={outfit.id} className="relative aspect-[3/4] rounded-[2.5rem] overflow-hidden border-[5px] border-white shadow-xl group transition-all hover:scale-[1.02] animate-in fade-in duration-500">
                          <img src={outfit.imageUrl} className="w-full h-full object-cover" onLoad={() => loadThenCompressAndStore(outfit.imageUrl)} alt="" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-4 gap-2 backdrop-blur-[2px]">
                            <button onClick={() => handleQuickTryOn(outfit.imageUrl, outfit.shopUrl)} className="w-full py-2.5 btn-theme rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg">Примерить</button>
                            {outfit.shopUrl && outfit.shopUrl !== '#' && (
                              <button onClick={(e) => { e.stopPropagation(); openInStore(outfit.shopUrl); }} className="w-full py-2 bg-white text-black rounded-full text-[7px] font-black uppercase tracking-widest shadow-lg">В магазин</button>
                            )}
                          </div>
                          {outfit.merchantId === 'me' && (
                            <div className="absolute top-3 left-3 bg-theme/90 text-white px-2 py-1 rounded-full text-[6px] font-black uppercase tracking-tighter shadow-md">Ваше</div>
                          )}
                        </div>
                      ))}
                  </div>
                  {filteredOutfits.length > outfitPage * OUTFITS_PAGE_SIZE && (
                    <div className="flex justify-center pt-4">
                      <button
                        onClick={() => setOutfitPage(p => p + 1)}
                        className="px-6 py-3 rounded-full bg-white border border-gray-200 text-[9px] font-black uppercase tracking-widest shadow-md"
                      >
                        Показать ещё
                      </button>
                    </div>
                  )}
                </div>

                {/* Upload Your Own */}
                <div className="pt-8 space-y-6 border-t border-gray-100 text-center">
                  <h3 className="serif text-xl font-black italic">Своя вещь</h3>
                  <div className="h-44 rounded-[2.5rem] overflow-hidden shadow-2xl">
                    <ImageUploader 
                      label={testClothes ? "Загружено" : "Загрузить фото вещи"} 
                      image={testClothes} 
                      onImageSelect={(img) => { setTestClothes(img); saveToStorage('test_clothes', img); handleQuickTryOn(img, '#'); }} 
                      icon={<svg className="w-10 h-10 text-theme" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>} 
                    />
                  </div>
                </div>
              </div>
            ) : activeTab === 'history' ? (
              <div className="p-8 space-y-8 animate-in fade-in">
                <h3 className="serif text-3xl font-black italic text-center">Архив</h3>
                <p className="text-[9px] text-gray-500 text-center uppercase tracking-widest">Хранятся последние {ARCHIVE_MAX_ITEMS} примерок</p>
                {history.length === 0 ? (
                  <div className="text-center pt-20 opacity-30">
                    <p className="text-[10px] font-black uppercase tracking-widest">Пусто</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {history.map(item => (
                      <div key={item.id} className="aspect-[3/4] rounded-[2.5rem] overflow-hidden border-4 border-white shadow-xl active:scale-95" onClick={() => setSelectedHistoryItem(item)}>
                        <img src={item.resultUrl} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === 'showroom' ? (
              <div className="p-8 space-y-10 animate-in slide-in-from-right-5">
                <div className="text-center space-y-2">
                  <h3 className="serif text-3xl font-black italic">{user?.name}</h3>
                  <p className="text-[10px] font-black uppercase text-theme tracking-widest italic leading-none">Управление коллекцией</p>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white p-7 rounded-[2.5rem] shadow-xl border border-gray-50 text-center col-span-1">
                    <span className="text-2xl font-black text-theme">{merchantProducts.length}</span>
                    <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Товаров</p>
                  </div>
                  <div className="bg-white p-7 rounded-[2.5rem] shadow-xl border border-gray-50 text-center col-span-1">
                    <span className="text-2xl font-black text-theme">{totalShopTryOns}</span>
                    <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Примерок</p>
                  </div>
                  <div className="bg-white p-7 rounded-[2.5rem] shadow-xl border border-gray-50 text-center col-span-1">
                    <span className="text-2xl font-black text-theme">{totalShopClicks}</span>
                    <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Переходов</p>
                  </div>
                </div>

                {metrics !== null && (
                  <div className="space-y-4">
                    <h4 className="serif text-lg font-bold italic cursor-help" title="Пока прототип для понимания. Позже будет точная статистика с сортировкой и графиками — базовая и расширенная.">📊 Статистика</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-5 rounded-[2rem] shadow-lg border border-gray-50 text-center">
                        <span className="text-xl font-black text-theme">{metrics.totalTryOns}</span>
                        <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest mt-1">Примерок</p>
                      </div>
                      <div className="bg-white p-5 rounded-[2rem] shadow-lg border border-gray-50 text-center">
                        <span className="text-xl font-black text-theme">{metrics.totalVideos}</span>
                        <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest mt-1">Видео</p>
                      </div>
                      <div className="bg-white p-5 rounded-[2rem] shadow-lg border border-gray-50 text-center">
                        <span className="text-xl font-black text-theme">{metrics.totalShopClicks}</span>
                        <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest mt-1">Переходов в магазин</p>
                      </div>
                      <div className="bg-white p-5 rounded-[2rem] shadow-lg border border-gray-50 text-center">
                        <span className="text-xl font-black text-theme">{metrics.totalArchiveSaves}</span>
                        <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest mt-1">Сохранений в архив</p>
                      </div>
                    </div>
                    {metrics.totalTryOns > 0 && (
                      <div className="grid grid-cols-3 gap-3 text-center text-[9px] font-bold uppercase tracking-widest text-gray-500">
                        <span>CTR: {Math.round((100 * metrics.totalShopClicks) / metrics.totalTryOns)}%</span>
                        <span>Видео: {Math.round((100 * metrics.totalVideos) / metrics.totalTryOns)}%</span>
                        <span>Сохр.: {Math.round((100 * metrics.totalArchiveSaves) / metrics.totalTryOns)}%</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-6">
                  <div className="flex flex-wrap gap-3 items-center justify-between px-2">
                    <h4 className="serif text-xl font-bold italic">Ваши товары</h4>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setStylistModalOpen(true)} className="bg-white border-2 border-[var(--theme-color)] text-[var(--theme-color)] font-black text-[9px] uppercase px-4 py-2.5 rounded-full shadow-lg">Вызвать стилиста</button>
                      <button onClick={() => setCollectionUploadOpen(true)} className="bg-gray-100 text-gray-800 font-black text-[9px] uppercase px-4 py-2.5 rounded-full shadow-lg border border-gray-200">Загрузить до 10 образов</button>
                      <button onClick={() => setAddProductModal(true)} className="bg-[var(--theme-color)] text-white font-black text-[9px] uppercase px-5 py-2.5 rounded-full shadow-lg border-2 border-[var(--theme-color)] ring-2 ring-black/10">+ Один товар</button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {merchantProducts.map(item => (
                      <div key={item.id} className="flex items-center p-4 bg-white rounded-[2.2rem] shadow-lg gap-5 border border-gray-50">
                        <img src={item.imageUrl} className="w-16 h-16 rounded-[1.2rem] object-cover shadow-sm" />
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-gray-800 uppercase tracking-tight">{item.name}</p>
                          <p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{CATEGORIES.find(c=>c.id === item.category)?.label}</p>
                        </div>
                        <button onClick={() => {
                          const updated = merchantProducts.filter(p => p.id !== item.id);
                          setMerchantProducts(updated);
                          saveMerchantProducts(updated, `${STORAGE_VER}_merchant_products`);
                        }} className="text-red-300 p-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : activeTab === 'admin' ? (
              <AdminPanel
                onBack={() => { setAdminUnlockedSession(false); goToTab('settings'); }}
                unlocked={adminUnlockedSession}
                onUnlock={() => {
                  setAdminUnlockedSession(true);
                  setAdminSessionUnlocked(true);
                  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('tvoisty_admin_unlocked', '1');
                }}
                metrics={metrics}
                onResetMetrics={async () => {
                  const next = await resetMetrics();
                  setMetrics(next);
                }}
              />
            ) : activeTab === 'lab' ? (
              <Lab onBack={() => goToTab('settings')} />
            ) : (
              <div className="p-10 space-y-12 animate-in fade-in">
                <h3 className="serif text-3xl font-black italic text-center">Настройки</h3>

                <div className="flex justify-center gap-8">
                    <button onClick={() => { const u = { ...user!, theme: 'turquoise' as AppTheme }; setUser(u); saveToStorage('user', u); document.body.className = 'theme-turquoise'; }} className={`w-14 h-14 rounded-full bg-[#0d9488] border-4 ${user?.theme === 'turquoise' ? 'border-white scale-125 shadow-2xl' : 'border-transparent opacity-30'} transition-all`}></button>
                    <button onClick={() => { const u = { ...user!, theme: 'lavender' as AppTheme }; setUser(u); saveToStorage('user', u); document.body.className = 'theme-lavender'; }} className={`w-14 h-14 rounded-full bg-[#8b5cf6] border-4 ${user?.theme === 'lavender' ? 'border-white scale-125 shadow-2xl' : 'border-transparent opacity-30'} transition-all`}></button>
                    <button onClick={() => { const u = { ...user!, theme: 'peach' as AppTheme }; setUser(u); saveToStorage('user', u); document.body.className = 'theme-peach'; }} className={`w-14 h-14 rounded-full bg-[#f97316] border-4 ${user?.theme === 'peach' ? 'border-white scale-125 shadow-2xl' : 'border-transparent opacity-30'} transition-all`}></button>
                </div>
                
                {/* Социальные сети — Issue #31 */}
                <div className="space-y-4">
                  <h4 className="serif text-lg font-bold italic text-center">Социальные сети</h4>
                  <p className="text-[9px] text-gray-500 text-center uppercase tracking-widest">Подключите для кнопки «Поделиться»</p>
                  <div className="space-y-3">
                    {SOCIAL_PLATFORMS.map((p) => {
                      const connected = socialConnections[p.id];
                      return (
                        <div key={p.id} className="flex items-center justify-between gap-4 p-4 bg-white rounded-[2rem] border border-gray-100 shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[10px] font-black" style={{ backgroundColor: p.brandColor }}>{p.short}</div>
                            <span className="text-[10px] font-black uppercase tracking-wide text-gray-800">{p.label}</span>
                          </div>
                          <span className="text-[8px] font-bold uppercase text-gray-400">{connected ? 'Подключено' : 'Не подключено'}</span>
                          <button
                            onClick={() => {
                              const next = { ...socialConnections, [p.id]: !connected };
                              setSocialConnections(next);
                              saveSocialConnections(`${STORAGE_VER}_social_connections`, next);
                            }}
                            className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest ${connected ? 'bg-gray-100 text-gray-600' : 'bg-theme/90 text-white'}`}
                          >
                            {connected ? 'Отключить' : 'Подключить'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-8 space-y-5 text-center">
                   <button onClick={() => setStylistModalOpen(true)} className="w-full py-5 bg-white border-2 border-theme text-theme rounded-[2rem] text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95">Позвать стилиста</button>
                   <button onClick={() => setActiveTab('lab')} className="w-full py-5 bg-theme/90 text-white rounded-[2rem] text-[11px] font-black uppercase tracking-widest shadow-xl active:scale-95 flex items-center justify-center gap-2">
                     <span>⚗️</span> Лаборатория — выбор моделей
                   </button>
                   <button onClick={() => goToTab('admin')} className="w-full py-5 bg-gray-800 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95">Дополнительные настройки</button>
                   <button onClick={() => setVerificationModal(true)} className="w-full py-5 bg-white border-2 border-theme text-theme rounded-[2rem] text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95">Бизнес кабинет</button>
                   {user?.isVerifiedMerchant && (
                     <button onClick={() => { const u: User = { ...user!, role: 'user', isVerifiedMerchant: false }; setUser(u); saveToStorage('user', u); goToTab('home'); }} className="w-full py-2 text-red-400 text-[8px] font-black uppercase tracking-widest">Отключить кабинет</button>
                   )}
                   <button onClick={handleReset} className="w-full py-2 text-gray-300 text-[8px] font-black uppercase tracking-widest mt-10">Сбросить все данные</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {addProductModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 backdrop-blur-md p-6 animate-in fade-in">
          <div className="w-full max-w-[380px] bg-white rounded-[4rem] p-10 space-y-6 animate-in zoom-in-95 shadow-4xl relative">
            <button onClick={() => setAddProductModal(false)} className="absolute top-10 right-10 text-gray-300">
               <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <h3 className="serif text-2xl font-black italic text-center">Новый товар</h3>
            <div className="space-y-4">
              <div className="h-40">
                <ImageUploader label="Фото" image={newProduct.image} onImageSelect={(img) => setNewProduct(p=>({...p, image: img}))} icon={<svg className="w-8 h-8 text-theme opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>} />
              </div>
              <input 
                type="text" 
                placeholder="Название" 
                className="w-full py-4 px-6 rounded-2xl bg-gray-50 border border-gray-100 text-[10px] font-black uppercase tracking-widest outline-none"
                value={newProduct.name}
                onChange={(e) => setNewProduct(p => ({...p, name: e.target.value}))}
              />
              {/* NEW: Shop URL Input */}
              <input 
                type="url" 
                placeholder="Ссылка на магазин (https://...)" 
                className="w-full py-4 px-6 rounded-2xl bg-gray-50 border border-gray-100 text-[10px] font-black uppercase tracking-widest outline-none"
                value={newProduct.shopUrl}
                onChange={(e) => setNewProduct(p => ({...p, shopUrl: e.target.value}))}
              />
              <select 
                className="w-full py-4 px-6 rounded-2xl bg-gray-50 border border-gray-100 text-[10px] font-black uppercase tracking-widest outline-none appearance-none"
                value={newProduct.category}
                onChange={(e) => setNewProduct(p => ({...p, category: e.target.value as CategoryType}))}
              >
                {CATEGORIES.filter(c=>c.id!=='all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <button onClick={() => {
              if (!newProduct.name || !newProduct.image) return;
              const product: CuratedOutfit = { id: `m_${Date.now()}`, name: newProduct.name, imageUrl: newProduct.image, category: newProduct.category, shopUrl: newProduct.shopUrl || '#', merchantId: 'me' };
              const updated = [product, ...merchantProducts];
              setMerchantProducts(updated);
              saveMerchantProducts(updated, `${STORAGE_VER}_merchant_products`);
              setAddProductModal(false);
              setNewProduct({ name: '', image: '', category: 'casual', shopUrl: '' });
            }} className="w-full py-5 btn-theme rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl">Опубликовать</button>
          </div>
        </div>
      )}

      {/* Поделиться — веер соцсетей (Issue #31) */}
      {socialModal && (
        <div className="fixed inset-0 z-[165] flex items-center justify-center bg-black/60 backdrop-blur-md p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-[380px] bg-white rounded-[4rem] p-8 space-y-6 animate-in zoom-in-95 duration-200 shadow-4xl relative">
            <button onClick={() => { setSocialModal(null); setShareTooltip(null); }} className="absolute top-8 right-8 text-gray-300 hover:text-gray-500">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <h3 className="serif text-2xl font-black italic text-center">Поделиться</h3>
            <div className="flex flex-wrap justify-center gap-4 py-2">
              {SOCIAL_PLATFORMS.map((platform) => {
                const connected = socialConnections[platform.id];
                const handleClick = () => {
                  if (!connected) {
                    setShareTooltip('Подключите в настройках');
                    setTimeout(() => setShareTooltip(null), 2500);
                    return;
                  }
                  if (platform.id === 'telegram') {
                    const text = encodeURIComponent('Мой образ — твоИИстиль');
                    const url = socialModal.startsWith('data:') ? window.location.href : socialModal;
                    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${text}`, '_blank', 'noopener,noreferrer');
                    setSuccessMsg('Ссылка открыта в Telegram');
                    setTimeout(() => setSuccessMsg(null), 3000);
                    setSocialModal(null);
                  } else {
                    const names: Record<string, string> = { vk: 'VK', facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', tenchat: 'TenChat', pinterest: 'Pinterest', dzen: 'Дзен', ok: 'OK' };
                    setSuccessMsg(`Публикация в ${names[platform.id] || platform.label} появится в следующей версии`);
                    setTimeout(() => setSuccessMsg(null), 3500);
                  }
                };
                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={handleClick}
                    title={connected ? `Поделиться в ${platform.label}` : 'Подключите в настройках'}
                    className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-[11px] font-black shadow-lg transition-all duration-200 ${connected ? 'hover:scale-110 cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
                    style={{ backgroundColor: platform.brandColor }}
                  >
                    {platform.short}
                  </button>
                );
              })}
            </div>
            {shareTooltip && (
              <p className="text-center text-[10px] font-bold text-gray-500 animate-in fade-in">{shareTooltip}</p>
            )}
            <button
              onClick={() => { setActiveTab('settings'); setSocialModal(null); setShareTooltip(null); }}
              className="w-full py-3 rounded-2xl border-2 border-theme text-theme text-[10px] font-black uppercase tracking-widest"
            >
              Настройки соцсетей
            </button>
          </div>
        </div>
      )}

      {/* Стилист — заглушка */}
      {stylistModalOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 backdrop-blur-md p-6 animate-in fade-in">
          <div className="w-full max-w-[380px] bg-white rounded-[4rem] p-10 space-y-6 animate-in zoom-in-95 shadow-4xl relative text-center">
            <button onClick={() => setStylistModalOpen(false)} className="absolute top-10 right-10 text-gray-300">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <h3 className="serif text-2xl font-black italic">Стилист</h3>
            <p className="text-[11px] text-gray-600 leading-relaxed">Его пока нет, но он появится очень скоро.</p>
            <button onClick={() => setStylistModalOpen(false)} className="w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-gray-100 text-gray-700">Закрыть</button>
          </div>
        </div>
      )}

      {/* Загрузка до 10 образов */}
      {collectionUploadOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 backdrop-blur-md p-6 animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-[420px] bg-white rounded-[4rem] p-8 space-y-6 animate-in zoom-in-95 shadow-4xl relative my-8">
            <button onClick={() => { setCollectionUploadOpen(false); setCollectionImages([]); setCollectionForm({ name: '', shopUrl: '', category: 'casual' }); }} className="absolute top-8 right-8 text-gray-300 z-10">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <h3 className="serif text-2xl font-black italic text-center">Коллекция (до 10 образов)</h3>
            <input
              type="file"
              accept="image/*"
              multiple
              className="w-full text-[10px]"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []).slice(0, 10);
                const next: string[] = [];
                for (const file of files) {
                  const dataUrl = await new Promise<string>((res, rej) => {
                    const r = new FileReader();
                    r.onloadend = () => res(r.result as string);
                    r.onerror = () => rej(new Error('Read failed'));
                    r.readAsDataURL(file);
                  });
                  const adapted = await resizeDataUrl(dataUrl);
                  next.push(adapted);
                }
                setCollectionImages(prev => [...prev, ...next].slice(0, 10));
                e.target.value = '';
              }}
            />
            {collectionImages.length > 0 && (
              <>
                <p className="text-[9px] text-gray-500 uppercase tracking-widest">Выбрано: {collectionImages.length} из 10</p>
                <div className="grid grid-cols-5 gap-2 max-h-32 overflow-y-auto">
                  {collectionImages.map((src, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setCollectionImages(prev => prev.filter((_, j) => j !== i))} className="absolute top-0 right-0 w-6 h-6 bg-red-400/90 text-white text-[10px] font-black rounded-bl">×</button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <input type="text" placeholder="Название коллекции" className="w-full py-4 px-6 rounded-2xl bg-gray-50 border border-gray-100 text-[10px] font-black uppercase tracking-widest outline-none" value={collectionForm.name} onChange={e => setCollectionForm(f => ({ ...f, name: e.target.value }))} />
            <input type="url" placeholder="Ссылка на магазин" className="w-full py-4 px-6 rounded-2xl bg-gray-50 border border-gray-100 text-[10px] font-black uppercase tracking-widest outline-none" value={collectionForm.shopUrl} onChange={e => setCollectionForm(f => ({ ...f, shopUrl: e.target.value }))} />
            <select className="w-full py-4 px-6 rounded-2xl bg-gray-50 border border-gray-100 text-[10px] font-black uppercase tracking-widest outline-none appearance-none" value={collectionForm.category} onChange={e => setCollectionForm(f => ({ ...f, category: e.target.value as CategoryType }))}>
              {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <button
              onClick={() => {
                if (collectionImages.length === 0) return;
                const name = collectionForm.name.trim() || 'Коллекция';
                const shopUrl = collectionForm.shopUrl.trim() || '#';
                const category = collectionForm.category;
                const newItems: CuratedOutfit[] = collectionImages.map((imageUrl, i) => ({
                  id: `m_${Date.now()}_${i}`,
                  name,
                  imageUrl,
                  shopUrl,
                  category,
                  merchantId: 'me',
                }));
                incrementMetric('totalCollectionsCreated').then(() => incrementMetric('totalOutfitsUploaded', newItems.length)).then(() => getMetrics().then(setMetrics));
                const updated = [...newItems, ...merchantProducts];
                setMerchantProducts(updated);
                saveMerchantProducts(updated, `${STORAGE_VER}_merchant_products`);
                setCollectionUploadOpen(false);
                setCollectionImages([]);
                setCollectionForm({ name: '', shopUrl: '', category: 'casual' });
                setSuccessMsg(`Добавлено образов: ${newItems.length}`);
                setTimeout(() => setSuccessMsg(null), 2500);
              }}
              disabled={collectionImages.length === 0}
              className="w-full py-5 btn-theme rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl disabled:opacity-50"
            >
              Опубликовать коллекцию
            </button>
          </div>
        </div>
      )}

      {/* Selected History Item Modal */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-white/98 backdrop-blur-3xl p-6 animate-in zoom-in-95 overflow-y-auto">
           <div className="w-full max-w-[420px] min-h-full flex flex-col pt-10 pb-24">
              <button onClick={() => { setSelectedHistoryItem(null); setArchiveVideoUrl(null); setArchiveVideoError(null); }} className="absolute top-10 right-8 text-gray-400 z-10"><svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
              <div className="relative rounded-[3.5rem] overflow-hidden shadow-4xl border-[10px] border-white ring-1 ring-gray-100 mt-10 shrink-0 bg-gray-50 flex items-center justify-center" style={{ maxHeight: 'min(70vh, 800px)' }}>
                <img src={selectedHistoryItem.resultUrl} className="w-full max-h-[min(70vh,800px)] object-contain" alt="" />
              </div>
              <div className="mt-10 grid grid-cols-2 gap-4">
                 <button 
                   onClick={() => openInStore(selectedHistoryItem.shopUrl)} 
                   className="col-span-2 py-5 rounded-3xl font-black text-[12px] uppercase tracking-widest shadow-2xl flex items-center justify-center gap-3 bg-[var(--theme-color)] text-white border-2 border-[var(--theme-color)] ring-2 ring-black/10"
                 >
                   Купить в магазине
                 </button>
                 {showVideoModelDropdown() && showModelChoiceOnHome() && (
                 <div className="col-span-2">
                   <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Модель для видео</label>
                   <select value={selectedVideoModel} onChange={e => setSelectedVideoModel(e.target.value)} className="w-full py-3 px-4 rounded-2xl bg-white border-2 border-gray-100 text-[10px] font-bold uppercase tracking-wide outline-none focus:border-theme">
                     {getVideoModelsForDropdown().map(m => <option key={m} value={m}>{m}</option>)}
                   </select>
                 </div>
                 )}
                 <button
                   onClick={async () => {
                     setArchiveVideoError(null);
                     setIsArchiveVideoProcessing(true);
                     try {
                       const videoModel = showVideoModelDropdown() ? selectedVideoModel : getDefaultVideoModel();
                       const videoPrompt = getEffectiveVideoPrompt();
                       const url = await generateVideo(selectedHistoryItem!.resultUrl, { model: videoModel, prompt: videoPrompt });
                       incrementMetric('totalVideos').then(() => getMetrics().then(setMetrics));
                       setArchiveVideoUrl(url);
                     } catch (err: unknown) {
                       const msg = err instanceof Error ? err.message : 'Не удалось создать видео. Попробуйте снова.';
                       setArchiveVideoError(msg);
                     } finally {
                       setIsArchiveVideoProcessing(false);
                     }
                   }}
                   disabled={isArchiveVideoProcessing}
                   className="col-span-2 py-5 bg-white border-2 border-theme text-theme rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl disabled:opacity-50 flex items-center justify-center gap-2"
                 >
                   {isArchiveVideoProcessing ? 'Создаём видео...' : 'Анимировать'}
                 </button>
                 <button onClick={() => { 
                   const link = document.createElement('a');
                   link.href = selectedHistoryItem.resultUrl;
                   link.download = 'look.png';
                   link.click();
                 }} className="py-4 bg-white border border-gray-100 rounded-3xl font-black text-[9px] uppercase tracking-widest">Скачать фото</button>
                 <button onClick={() => { incrementMetric('totalShares').then(() => getMetrics().then(setMetrics)); setSocialModal(selectedHistoryItem.resultUrl); }} className="py-4 bg-white border border-gray-100 rounded-3xl font-black text-[9px] uppercase tracking-widest">Поделиться</button>
                 {archiveVideoError && (
                   <p className="col-span-2 text-red-500 text-[9px] font-bold uppercase text-center py-2">{archiveVideoError}</p>
                 )}
                 {archiveVideoUrl && (
                   <>
                     <div className="col-span-2 rounded-2xl overflow-hidden border-2 border-white shadow-xl aspect-[9/16] max-h-64 bg-black">
                       <video src={archiveVideoUrl} className="w-full h-full object-contain" controls playsInline />
                     </div>
                     <button
                       title="Удалось? В Telegram или скачайте. В MVP в архиве только последние примерки — доработаем."
                       onClick={() => {
                         const link = document.createElement('a');
                         link.href = archiveVideoUrl;
                         link.download = 'look.mp4';
                         link.click();
                       }}
                       className="py-4 rounded-3xl font-black text-[9px] uppercase tracking-widest bg-[var(--theme-color)] text-white border-2 border-[var(--theme-color)]"
                     >
                       Скачать видео
                     </button>
                     <button onClick={() => { incrementMetric('totalShares').then(() => getMetrics().then(setMetrics)); setSocialModal(archiveVideoUrl); }} className="py-4 bg-white border border-gray-100 rounded-3xl font-black text-[9px] uppercase tracking-widest">Поделиться видео</button>
                   </>
                 )}
                 <button onClick={() => { setSelectedHistoryItem(null); setArchiveVideoUrl(null); setArchiveVideoError(null); }} className="col-span-2 py-4 text-gray-400 font-black text-[9px] uppercase tracking-widest">Закрыть</button>
              </div>
           </div>
        </div>
      )}

      {/* Verification Modal (Merchant) */}
      {verificationModal && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/80 backdrop-blur-xl p-8 animate-in fade-in">
          <div className="w-full max-w-[420px] bg-white rounded-[4rem] p-12 space-y-8 animate-in slide-in-from-bottom-20 shadow-4xl text-center">
            <h2 className="serif text-3xl font-black italic text-gray-900 leading-tight">Верификация<br/>Бизнеса</h2>
            <div className="space-y-4">
              <button onClick={() => { const u: User = { ...user!, role: 'merchant', isVerifiedMerchant: true, isRegistered: true, name: 'Стильный Бренд' }; setUser(u); saveToStorage('user', u); setVerificationModal(false); goToTab('showroom'); }} className="w-full py-6 bg-[#0055a4] text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest shadow-xl">Госуслуги</button>
              <button onClick={() => { const u: User = { ...user!, role: 'merchant', isVerifiedMerchant: true, isRegistered: true, name: 'T-Brand Store' }; setUser(u); saveToStorage('user', u); setVerificationModal(false); goToTab('showroom'); }} className="w-full py-6 bg-[#ffdd2d] text-black rounded-[2rem] font-black text-[10px] uppercase tracking-widest shadow-xl">T-Bank ID</button>
              <button onClick={() => setVerificationModal(false)} className="w-full py-2 text-gray-300 text-[9px] font-black uppercase mt-4">Позже</button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {authModal && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 backdrop-blur-xl p-8 animate-in fade-in">
          <div className="w-full max-w-[420px] bg-white rounded-[4rem] p-12 space-y-10 shadow-4xl text-center">
            <h2 className="serif text-4xl font-black italic text-gray-900">Клуб Стиля</h2>
            <button onClick={() => { const u = { ...user!, isRegistered: true, name: 'Модный Пользователь' }; setUser(u); saveToStorage('user', u); setAuthModal(false); }} className="w-full py-7 btn-theme rounded-[2rem] font-black text-[11px] uppercase tracking-widest shadow-2xl">Вступить в клуб</button>
            <button onClick={() => setAuthModal(false)} className="w-full py-2 text-gray-300 text-[9px] font-black uppercase">Пропустить</button>
          </div>
        </div>
      )}
      
      {/* Footer Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 glass h-20 px-10 flex items-center justify-between border-t border-gray-100/30 z-40">
        <button onClick={() => goToTab('home')} className={`p-3 transition-all ${activeTab === 'home' ? 'text-theme scale-125' : 'text-gray-300'}`}>
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>
        </button>
        <button onClick={() => goToTab('history')} className={`p-3 transition-all ${activeTab === 'history' ? 'text-theme scale-125' : 'text-gray-300'}`}>
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/></svg>
        </button>
        <button onClick={() => goToTab('settings')} className={`p-3 transition-all ${activeTab === 'settings' ? 'text-theme scale-125' : 'text-gray-300'}`}>
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
        </button>
      </div>

      {successMsg && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[300] bg-theme text-white px-8 py-3 rounded-full text-[9px] font-black uppercase tracking-widest shadow-4xl animate-in fade-in slide-in-from-top-2">
          {successMsg}
        </div>
      )}

      {state.error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] bg-red-500 text-white px-8 py-4 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-4xl animate-bounce border-2 border-white">
          {state.error}
        </div>
      )}
    </div>
  );
};

function handleDownload(imgUrl: string) {
  // Для надёжного скачивания (особенно с чужих доменов) делаем fetch + blob,
  // как для видео: иначе браузер может просто открыть картинку в этом же табе.
  (async () => {
    try {
      const res = await fetch(imgUrl, { mode: 'cors' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `look_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // В крайнем случае открываем в новом табе, чтобы не потерять приложение.
      window.open(imgUrl, '_blank');
    }
  })();
}

export default App;
