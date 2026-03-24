import React, { useState, useEffect, useRef } from 'react';
import { Dropzone } from './Dropzone';
import { AppState } from '../types';
import { MOCK_SHOPS } from '../constants';
import { IMAGE_VALIDATION_ERROR, isValidImageFile } from '../utils/fileValidation';
import { compressImageToBase64 } from '../utils/imageCompression';

interface UploadBoxProps {
  // Пропсы для режима "фото пользователя"
  onUploadNew?: (base64: string) => void;
  onSelectPhoto?: (url: string) => void;

  // Пропсы для режима "одежда / галерея образов"
  onUpload?: (base64: string) => void;
  backendLooks?: { id: string; imageUrl: string }[];

  // Общие пропсы
  t: any;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  disableTryOnActions?: boolean;
}

const UploadBox: React.FC<UploadBoxProps> = ({
  onUploadNew,
  onSelectPhoto,
  onUpload,
  backendLooks,
  t,
  state,
  setState,
  disableTryOnActions = false,
}) => {
  // Режим "фото пользователя" (шаг 1) — если передан onUploadNew
  const isUserMode = !!onUploadNew;

  if (isUserMode) {
    const userPhotos = state.auth?.userPhotos || [];
    const hasPhotos = userPhotos.length > 0;
    const [showUpload, setShowUpload] = useState(!hasPhotos);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    const deletePhoto = (img: string) => {
      setState(prev => {
        const current = prev.auth?.userPhotos || [];
        return {
          ...prev,
          auth: {
            ...prev.auth,
            userPhotos: current.filter(p => p !== img),
          },
        };
      });
    };

    return (
      <div className="flex flex-col items-center px-6 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
        <div className="w-full max-w-md mb-6">
          <div className="flex items-center justify-between px-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">МОИ ФОТО</h3>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {(userPhotos?.length || 0)} ШТ.
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setViewMode('grid')}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  viewMode === 'grid' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'
                }`}
              >
                <span className="text-[10px]">⊞</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  viewMode === 'list' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'
                }`}
              >
                <span className="text-[10px]">≡</span>
              </button>
              <button
                onClick={() => {
                  if (hasPhotos) {
                    const input = document.getElementById('user-photo-file-input') as HTMLInputElement | null;
                    input?.click();
                  } else {
                    setShowUpload(true);
                  }
                }}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl ml-2 ${
                  showUpload ? 'bg-slate-900 text-white rotate-45' : 'bg-[var(--bg-gradient)] text-white'
                }`}
              >
                <span className="text-2xl">+</span>
              </button>
            </div>
          </div>
        </div>

        <input
          id="user-photo-file-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !onUploadNew) return;
            if (!isValidImageFile(file)) {
              alert(IMAGE_VALIDATION_ERROR);
              e.target.value = '';
              return;
            }
            e.target.value = '';
            try {
              const compressed = await compressImageToBase64(file);
              onUploadNew(compressed);
            } catch {
              // Fallback без сжатия
              const reader = new FileReader();
              reader.onloadend = () => { if (typeof reader.result === 'string') onUploadNew(reader.result); };
              reader.readAsDataURL(file);
            }
          }}
        />

        {showUpload && !hasPhotos && (
          <div className="w-full max-w-md mb-8">
            <div className="w-full bg-white rounded-[3.5rem] p-10 shadow-2xl border border-slate-50">
              <div className="flex flex-col items-center text-center mb-8">
                <h2 className="text-xl font-black tracking-tight mb-2">{t.yourPhoto}</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  {t.clickToUpload}
                </p>
              </div>

              <div className="aspect-[3/4] w-full">
                <Dropzone
                  onImageUpload={(img) => {
                    if (onUploadNew) {
                      onUploadNew(img);
                    }
                    setShowUpload(false);
                  }}
                  placeholder={t.clickToUpload}
                />
              </div>
            </div>
          </div>
        )}

        <div className="w-full max-w-md">
          {userPhotos.length > 0 ? (
            viewMode === 'list' ? (
              /* Вертикальный слайдер — крупные карточки на всю ширину */
              <div className="space-y-6 pb-6">
                {userPhotos.map((img, idx) => (
                  <div key={idx} className="relative w-full">
                    <div className="aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-xl bg-slate-50 border-4 border-white flex items-center justify-center">
                      <img
                        src={img}
                        alt={`User ${idx}`}
                        className="w-full h-full object-contain rounded-[2.5rem]"
                      />
                      {/* Кнопки всегда видны */}
                      <div className="absolute top-4 right-4 flex flex-col gap-2.5">
                        {onSelectPhoto && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelectPhoto(img); }}
                            className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-700 shadow-md transition-all active:scale-90"
                            title="Выбрать для примерки"
                          >
                            <span className="text-base leading-none">◎</span>
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); deletePhoto(img); }}
                          className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-red-400 shadow-md transition-all active:scale-90"
                          title="Удалить"
                        >
                          <span className="text-xl font-light leading-none">×</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Сетка 2 колонки */
              <div className="grid grid-cols-2 gap-4 px-2 pb-6">
                {userPhotos.map((img, idx) => (
                  <div key={idx} className="relative">
                    <div className="relative aspect-[3/4] rounded-[2rem] overflow-hidden shadow-md bg-slate-50 border-2 border-white flex items-center justify-center">
                      <img
                        src={img}
                        alt={`User ${idx}`}
                        className="w-full h-full object-contain rounded-[2rem]"
                      />
                      {/* Кнопки всегда видны */}
                      <div className="absolute top-2.5 right-2.5 flex flex-col gap-2">
                        {onSelectPhoto && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelectPhoto(img); }}
                            className="w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-700 shadow-sm transition-all active:scale-90"
                            title="Выбрать для примерки"
                          >
                            <span className="text-sm leading-none">◎</span>
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); deletePhoto(img); }}
                          className="w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-red-400 shadow-sm transition-all active:scale-90"
                          title="Удалить"
                        >
                          <span className="text-lg font-light leading-none">×</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest px-4">
              Пока нет сохранённых фото — нажмите плюс и загрузите первое.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Режим "одежда / галерея" (шаг 2) — если передан onUpload
  const [galleryMode, setGalleryMode] = useState<'grid' | 'scroll'>('grid');
  const [showUpload, setShowUpload] = useState(false);
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (scrollToId && galleryMode === 'scroll') {
      const el = scrollRefs.current[scrollToId];
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      }
      setScrollToId(null);
    }
  }, [scrollToId, galleryMode]);

  const deleteGarment = (img: string) => {
    setState(prev => {
      const garmentMemory = prev.auth?.garmentMemory || [];
      return {
        ...prev,
        auth: {
          ...prev.auth,
          garmentMemory: garmentMemory.filter(p => p !== img),
        },
      };
    });
  };

  const uploadedItems = (state.auth?.garmentMemory || []).map((img, idx) => ({
    id: `uploaded-${idx}`,
    imageUrl: img,
    title: `Загружено #${idx + 1}`,
    shopName: 'Мои загрузки',
    isUserUploaded: true,
    isBackendLook: false,
  }));

  const backendLookItems = (backendLooks || []).map((l, idx) => ({
    id: l.id,
    imageUrl: l.imageUrl,
    title: `Образ #${idx + 1}`,
    shopName: 'Коллекция',
    isBackendLook: true,
    isUserUploaded: false,
  }));

  const isDev = (import.meta as any)?.env?.MODE === 'development';

  const mockItems =
    (MOCK_SHOPS || []).flatMap(shop =>
      (shop.collections || []).flatMap(col =>
        (col.items || []).map(item => ({
          ...item,
          shopName: shop.name,
          isBackendLook: true,
          isUserUploaded: false,
        }))
      )
    );

  const shopItems =
    backendLookItems.length > 0
      ? backendLookItems
      : (isDev ? mockItems : []);

  const allItems = [...uploadedItems, ...shopItems];
  const likedLooks = state.auth?.likedLooks || [];
  const sortedItems = [...allItems].sort((a, b) => {
    const aLiked = likedLooks.includes(a.imageUrl);
    const bLiked = likedLooks.includes(b.imageUrl);
    if (aLiked && !bLiked) return -1;
    if (!aLiked && bLiked) return 1;
    return 0;
  });

  const toggleLike = (imageUrl: string) => {
    setState((prev) => {
      const currentLiked = prev.auth?.likedLooks || [];
      const isLiked = currentLiked.includes(imageUrl);
      const nextLiked = isLiked
        ? currentLiked.filter((u) => u !== imageUrl)
        : [imageUrl, ...currentLiked];
      return {
        ...prev,
        auth: {
          ...prev.auth,
          likedLooks: nextLiked,
        },
      };
    });
  };

  return (
    <div className="flex flex-col items-center px-6 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
      <div className="w-full max-w-md mb-6">
        <div className="flex items-center justify-between px-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">
              {t.gallery}
            </h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {(sortedItems?.length || 0)} ВЕЩЕЙ
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setGalleryMode('grid')}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                galleryMode === 'grid' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'
              }`}
            >
              <span className="text-[10px]">⊞</span>
            </button>
            <button
              onClick={() => setGalleryMode('scroll')}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                galleryMode === 'scroll' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'
              }`}
            >
              <span className="text-[10px]">≡</span>
            </button>
            <button
              onClick={() => setShowUpload(!showUpload)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ml-2 ${
                showUpload ? 'bg-slate-900 text-white rotate-45' : 'bg-[var(--bg-gradient)] text-white'
              }`}
            >
              <span className="text-xl">+</span>
            </button>
          </div>
        </div>
      </div>

      {showUpload && (
        <div className="w-full max-w-md mb-8">
          <div className="w-full bg-white rounded-[3.5rem] p-10 shadow-2xl border border-slate-50">
            <div className="flex flex-col items-center text-center mb-8">
              <h2 className="text-xl font-black tracking-tight mb-2">НОВАЯ ВЕЩЬ</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                ВЫБЕРИТЕ ФОТО ОДЕЖДЫ
              </p>
            </div>

            <div className="aspect-[3/4] w-full">
              <Dropzone
                onImageUpload={(img) => {
                  setState(prev => {
                    const current = prev.auth?.garmentMemory || [];
                    const userPhotos = prev.auth?.userPhotos || [];
                    const historyUrls = (prev.auth?.lookHistory || []).map(h => h.imageUrl).filter(Boolean);

                    if (
                      current.includes(img) ||
                      userPhotos.includes(img) ||
                      historyUrls.includes(img)
                    ) {
                      return prev;
                    }
                    return {
                      ...prev,
                      auth: {
                        ...prev.auth,
                        garmentMemory: [img, ...current].slice(0, 10),
                      },
                    };
                  });
                  setShowUpload(false);
                }}
                placeholder={t.clickToUpload}
              />
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md">
        {galleryMode === 'scroll' ? (
          /* Вертикальный слайдер — крупные карточки, кнопки снизу */
          <div className="space-y-8 pb-10">
            {sortedItems.map((item) => {
              const isLiked = likedLooks.includes(item.imageUrl);
              return (
                <div
                  key={item.id}
                  ref={(el) => { scrollRefs.current[item.id] = el; }}
                  className="relative w-full"
                >
                  <div className="relative aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-xl bg-slate-50 border-4 border-white flex items-center justify-center">
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-contain rounded-[2.5rem]"
                    />
                    {/* Лайк + удалить — верхний правый угол */}
                    <div className="absolute top-4 right-4 flex flex-col gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLike(item.imageUrl); }}
                        className={`w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 ${isLiked ? 'text-red-500' : 'text-slate-400'}`}
                        title="Лайк"
                      >
                        <span className="text-base leading-none">{isLiked ? '♥' : '♡'}</span>
                      </button>
                      {item.isUserUploaded && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteGarment(item.imageUrl); }}
                          className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-red-400 shadow-md transition-all active:scale-90"
                          title="Удалить"
                        >
                          <span className="text-xl font-light leading-none">×</span>
                        </button>
                      )}
                    </div>
                    {/* ◎ Примерить — нижний правый угол */}
                    {onUpload && (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (!disableTryOnActions) onUpload(item.imageUrl); }}
                        disabled={disableTryOnActions}
                        className={`absolute bottom-4 right-4 w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${disableTryOnActions ? 'opacity-40 cursor-not-allowed text-slate-300' : 'text-[var(--primary)] hover:shadow-xl'}`}
                        title="Примерить"
                      >
                        <span className="text-xl leading-none">◎</span>
                      </button>
                    )}
                  </div>
                  <div className="mt-3 px-2">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-900 truncate">{item.title}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate mt-0.5">{item.shopName}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Сетка 2 колонки — клик по фото переходит в листалку */
          <div className="grid grid-cols-2 gap-4 px-2 pb-10">
            {sortedItems.map((item) => {
              const isLiked = likedLooks.includes(item.imageUrl);
              return (
                <div key={item.id} className="flex flex-col">
                  <div
                    className="relative aspect-[3/4] rounded-[2rem] overflow-hidden shadow-md bg-slate-50 border-2 border-white mb-2 flex items-center justify-center cursor-pointer"
                    onClick={() => { setScrollToId(item.id); setGalleryMode('scroll'); }}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-contain rounded-[2rem]"
                    />
                    {/* Лайк — верхний правый */}
                    <div className="absolute top-2.5 right-2.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLike(item.imageUrl); }}
                        className={`w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm transition-all active:scale-90 ${isLiked ? 'text-red-500' : 'text-slate-300'}`}
                        title="Лайк"
                      >
                        <span className="text-sm leading-none">{isLiked ? '♥' : '♡'}</span>
                      </button>
                    </div>
                    {/* ◎ Примерить — нижний правый */}
                    {onUpload && (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (!disableTryOnActions) onUpload(item.imageUrl); }}
                        disabled={disableTryOnActions}
                        className={`absolute bottom-2.5 right-2.5 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 ${disableTryOnActions ? 'opacity-40 cursor-not-allowed text-slate-300' : 'text-[var(--primary)]'}`}
                        title="Примерить"
                      >
                        <span className="text-base leading-none">◎</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-900 truncate px-1">{item.title}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};

export default UploadBox;
