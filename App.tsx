
import React, { useState, useEffect, useMemo } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { describeOutfit, generateTryOn, generateVideo } from './services/geminiService';
import { TryOnState, User, CuratedOutfit, PersonGalleryItem, HistoryItem, AppTheme, CategoryType } from './types';

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

const App: React.FC = () => {
  const STORAGE_VER = "v29_business_ready";
  
  const [user, setUser] = useState<User | null>(null);
  const [personGallery, setPersonGallery] = useState<PersonGalleryItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [merchantProducts, setMerchantProducts] = useState<CuratedOutfit[]>([]);
  const [testClothes, setTestClothes] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'settings' | 'showroom'>('home');
  const [activeCategory, setActiveCategory] = useState<CategoryType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [authModal, setAuthModal] = useState(false);
  const [verificationModal, setVerificationModal] = useState(false);
  const [addProductModal, setAddProductModal] = useState(false);
  const [socialModal, setSocialModal] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  
  const [newProduct, setNewProduct] = useState({ name: '', image: '', category: 'casual' as CategoryType, shopUrl: '' });
  
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
      const savedHistory = localStorage.getItem(`${STORAGE_VER}_history`);
      if (savedHistory) setHistory(JSON.parse(savedHistory));
      const savedMerchantProducts = localStorage.getItem(`${STORAGE_VER}_merchant_products`);
      if (savedMerchantProducts) setMerchantProducts(JSON.parse(savedMerchantProducts));
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
      const personBase64 = await urlToBase64(state.personImage!);
      const outfitBase64 = await urlToBase64(outfitUrl);
      const description = await describeOutfit(outfitBase64);
      setState(prev => ({ ...prev, status: 'Примеряем образ...' }));
      const imageUrl = await generateTryOn(personBase64, outfitBase64, description);
      setState(prev => ({ ...prev, resultImage: imageUrl, isProcessing: false, status: '' }));
      const newItem: HistoryItem = { id: `h_${Date.now()}`, resultUrl: imageUrl, outfitUrl, shopUrl, timestamp: Date.now() };
      const newHistory = [newItem, ...history].slice(0, 20);
      setHistory(newHistory);
      saveToStorage('history', newHistory);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ИИ перегружен, попробуйте снова';
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
      setTimeout(() => setState(p => ({ ...p, error: null })), 4000);
    }
  };

  const urlToBase64 = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (url.startsWith('data:')) return resolve(url);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        let width = img.width, height = img.height;
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          try { resolve(canvas.toDataURL('image/png', 0.8)); } catch (e) { reject(e); }
        }
      };
      img.onerror = () => reject(new Error('Ошибка загрузки'));
      img.src = url;
    });
  };

  /** Один клик = один вызов API генерации видео. Без авто-повторов. */
  const handleCreateVideo = async () => {
    if (!state.resultImage) return;
    setIsVideoProcessing(true);
    setVideoError(null);
    try {
      const videoUrl = await generateVideo(state.resultImage);
      setResultVideoUrl(videoUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось создать видео. Попробуйте снова.';
      setVideoError(msg);
    } finally {
      setIsVideoProcessing(false);
    }
  };

  const openInStore = (url: string) => {
    if (!url || url === '#') {
       setSuccessMsg("Ссылка на магазин не указана");
       setTimeout(() => setSuccessMsg(null), 2000);
       return;
    }
    window.open(url, '_blank');
  };

  const goToTab = (tab: 'home' | 'history' | 'settings' | 'showroom') => {
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
             {/* Результат примерки — фото пользователя и образ */}
             <div className="relative rounded-[3.5rem] overflow-hidden shadow-4xl aspect-[3/4] border-[10px] border-white ring-1 ring-gray-100">
                <img src={state.resultImage} className="w-full h-full object-cover" alt="Результат примерки" />
             </div>

             {/* Кнопка «Создать видео»: один клик = один вызов API */}
             <div className="space-y-3">
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
                 <div className="rounded-[2rem] overflow-hidden border-4 border-white shadow-xl aspect-video">
                   <video src={resultVideoUrl} controls className="w-full h-full object-cover" playsInline />
                 </div>
               )}
             </div>

             <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => openInStore(state.currentShopUrl!)} 
                  className="col-span-2 py-5 bg-theme text-white rounded-3xl font-black text-[12px] uppercase tracking-widest shadow-2xl active:scale-95 flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                  Купить в магазине
                </button>
                <button onClick={() => handleDownload(state.resultImage!)} className="py-4 bg-white border border-gray-100 rounded-3xl font-black text-[9px] uppercase tracking-widest shadow-xl active:scale-95">Скачать</button>
                <button onClick={() => setSocialModal(state.resultImage)} className="py-4 bg-white border border-gray-100 rounded-3xl font-black text-[9px] uppercase tracking-widest shadow-xl active:scale-95">Поделиться</button>
                <button onClick={() => { setState(s => ({ ...s, resultImage: null })); setResultVideoUrl(null); setVideoError(null); }} className="col-span-2 py-4 text-gray-400 font-black text-[9px] uppercase tracking-widest active:scale-95">Примерить другое</button>
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

                  {/* Dynamic Grid */}
                  <div className="grid grid-cols-2 gap-5 min-h-[400px]">
                    {filteredOutfits.map(outfit => (
                      <div key={outfit.id} className="relative aspect-[3/4] rounded-[2.5rem] overflow-hidden border-[5px] border-white shadow-xl group transition-all hover:scale-[1.02] animate-in fade-in duration-500">
                        <img src={outfit.imageUrl} className="w-full h-full object-cover" />
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
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-7 rounded-[2.5rem] shadow-xl border border-gray-50 text-center">
                    <span className="text-2xl font-black text-theme">{merchantProducts.length}</span>
                    <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Товаров</p>
                  </div>
                  <div className="bg-white p-7 rounded-[2.5rem] shadow-xl border border-gray-50 text-center">
                    <span className="text-2xl font-black text-theme">0</span>
                    <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Кликов</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex justify-between px-2 items-center">
                    <h4 className="serif text-xl font-bold italic">Ваши товары</h4>
                    <button onClick={() => setAddProductModal(true)} className="bg-theme text-white font-black text-[9px] uppercase px-5 py-2.5 rounded-full shadow-lg">+ Добавить</button>
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
                          saveToStorage('merchant_products', updated);
                        }} className="text-red-300 p-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-10 space-y-12 animate-in fade-in">
                <h3 className="serif text-3xl font-black italic text-center">Настройки</h3>
                <div className="flex justify-center gap-8">
                    <button onClick={() => { const u = { ...user!, theme: 'turquoise' as AppTheme }; setUser(u); saveToStorage('user', u); document.body.className = 'theme-turquoise'; }} className={`w-14 h-14 rounded-full bg-[#0d9488] border-4 ${user?.theme === 'turquoise' ? 'border-white scale-125 shadow-2xl' : 'border-transparent opacity-30'} transition-all`}></button>
                    <button onClick={() => { const u = { ...user!, theme: 'lavender' as AppTheme }; setUser(u); saveToStorage('user', u); document.body.className = 'theme-lavender'; }} className={`w-14 h-14 rounded-full bg-[#8b5cf6] border-4 ${user?.theme === 'lavender' ? 'border-white scale-125 shadow-2xl' : 'border-transparent opacity-30'} transition-all`}></button>
                    <button onClick={() => { const u = { ...user!, theme: 'peach' as AppTheme }; setUser(u); saveToStorage('user', u); document.body.className = 'theme-peach'; }} className={`w-14 h-14 rounded-full bg-[#f97316] border-4 ${user?.theme === 'peach' ? 'border-white scale-125 shadow-2xl' : 'border-transparent opacity-30'} transition-all`}></button>
                </div>
                
                <div className="pt-8 space-y-5 text-center">
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
              saveToStorage('merchant_products', updated);
              setAddProductModal(false);
              setNewProduct({ name: '', image: '', category: 'casual', shopUrl: '' });
            }} className="w-full py-5 btn-theme rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl">Опубликовать</button>
          </div>
        </div>
      )}

      {/* Selected History Item Modal */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-white/98 backdrop-blur-3xl p-6 animate-in zoom-in-95">
           <div className="w-full max-w-[420px] h-full flex flex-col pt-10">
              <button onClick={() => setSelectedHistoryItem(null)} className="absolute top-10 right-8 text-gray-400"><svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
              <div className="relative rounded-[3.5rem] overflow-hidden shadow-4xl aspect-[3/4] border-[10px] border-white ring-1 ring-gray-100 mt-10">
                <img src={selectedHistoryItem.resultUrl} className="w-full h-full object-cover" />
              </div>
              <div className="mt-10 grid grid-cols-2 gap-4">
                 <button 
                   onClick={() => openInStore(selectedHistoryItem.shopUrl)} 
                   className="col-span-2 py-5 btn-theme rounded-3xl font-black text-[12px] uppercase tracking-widest shadow-2xl flex items-center justify-center gap-3"
                 >
                   Купить в магазине
                 </button>
                 <button onClick={() => { 
                   const link = document.createElement('a');
                   link.href = selectedHistoryItem.resultUrl;
                   link.download = 'look.png';
                   link.click();
                 }} className="py-4 bg-white border border-gray-100 rounded-3xl font-black text-[9px] uppercase tracking-widest">Скачать</button>
                 <button onClick={() => setSocialModal(selectedHistoryItem.resultUrl)} className="py-4 bg-white border border-gray-100 rounded-3xl font-black text-[9px] uppercase tracking-widest">Поделиться</button>
                 <button onClick={() => setSelectedHistoryItem(null)} className="col-span-2 py-4 text-gray-400 font-black text-[9px] uppercase tracking-widest">Закрыть</button>
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
  const link = document.createElement('a');
  link.href = imgUrl;
  link.download = `look_${Date.now()}.png`;
  link.click();
}

export default App;
