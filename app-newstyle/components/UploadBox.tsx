import React, { useState } from 'react';
import { Dropzone } from './Dropzone';
import { FullscreenPreview } from './FullscreenPreview';
import { AppState } from '../types';
import { MOCK_SHOPS } from '../constants';

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
}

const UploadBox: React.FC<UploadBoxProps> = ({
  onUploadNew,
  onSelectPhoto,
  onUpload,
  backendLooks,
  t,
  state,
  setState,
}) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file || !onUploadNew) return;
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result;
              if (typeof result === 'string') {
                onUploadNew(result);
              }
            };
            reader.readAsDataURL(file);
            e.target.value = '';
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
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-6 -mx-6 px-6 snap-x snap-mandatory">
                {userPhotos.map((img, idx) => (
                  <div key={idx} className={`flex-shrink-0 w-40 snap-start group relative ${userPhotos.length === 1 ? 'mx-auto' : ''}`}>
                    <div className="aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-xl bg-slate-50 border-4 border-white group-hover:shadow-2xl transition-all duration-700 flex items-center justify-center">
                      <img
                        src={img}
                        alt={`User ${idx}`}
                        className="w-full h-full object-contain rounded-[2.5rem] cursor-pointer group-hover:scale-110 transition-transform duration-1000"
                        onClick={() => setPreviewImage(img)}
                      />
                      <div className="absolute top-3 right-3 flex flex-col gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPhoto && onSelectPhoto(img);
                          }}
                          className="w-8 h-8 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-slate-900 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="text-xs">◎</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePhoto(img);
                          }}
                          className="w-8 h-8 bg-red-500/80 backdrop-blur-md rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <span className="text-sm">✕</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-6 px-2 pb-6">
                {userPhotos.map((img, idx) => (
                  <div key={idx} className="group relative">
                    <div className="relative aspect-[3/4] rounded-[2rem] overflow-hidden shadow-md bg-slate-50 border-2 border-white mb-3 flex items-center justify-center">
                      <img
                        src={img}
                        alt={`User ${idx}`}
                        className="w-full h-full object-contain rounded-[2rem] cursor-pointer group-hover:scale-110 transition-transform duration-500"
                        onClick={() => setPreviewImage(img)}
                      />
                      <div className="absolute top-3 right-3 flex flex-col gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPhoto && onSelectPhoto(img);
                          }}
                          className="w-8 h-8 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-slate-900 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="text-xs">◎</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePhoto(img);
                          }}
                          className="w-8 h-8 bg-red-500/80 backdrop-blur-md rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <span className="text-sm">✕</span>
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

        <FullscreenPreview image={previewImage} onClose={() => setPreviewImage(null)} />
      </div>
    );
  }

  // Режим "одежда / галерея" (шаг 2) — если передан onUpload
  const [galleryMode, setGalleryMode] = useState<'grid' | 'scroll'>('grid');
  const [showUpload, setShowUpload] = useState(false);

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
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-10 -mx-6 px-6 snap-x snap-mandatory">
            {sortedItems.map((item) => (
              <div
                key={item.id}
                className={`flex-shrink-0 w-56 sm:w-64 snap-center group ${sortedItems.length === 1 ? 'mx-auto' : ''}`}
              >
                <div className="relative aspect-[3/4] rounded-[3rem] overflow-hidden shadow-xl group-hover:shadow-2xl transition-all duration-700 mb-6 bg-slate-50 border-4 border-white flex items-center justify-center">
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-full h-full object-contain rounded-[3rem] group-hover:scale-105 transition-transform duration-1000 cursor-pointer"
                    onClick={() => setPreviewImage(item.imageUrl)}
                  />
                  <div className="absolute top-6 right-6 flex flex-col gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(item.imageUrl);
                      }}
                      className={`w-10 h-10 backdrop-blur-xl rounded-full flex items-center justify-center shadow-xl transition-opacity ${
                        likedLooks.includes(item.imageUrl)
                          ? 'bg-red-500/90 text-white opacity-100'
                          : 'bg-white/80 text-slate-900 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <span className="text-base">{likedLooks.includes(item.imageUrl) ? '❤️' : '🤍'}</span>
                    </button>
                    {onUpload && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpload(item.imageUrl);
                        }}
                        className="w-12 h-12 bg-white/80 backdrop-blur-xl rounded-full flex items-center justify-center text-slate-900 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span className="text-xl">◎</span>
                      </button>
                    )}
                    {item.isUserUploaded && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteGarment(item.imageUrl);
                        }}
                        className="w-12 h-12 bg-red-500/80 backdrop-blur-xl rounded-full flex items-center justify-center text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span className="text-xl">✕</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="px-4">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-900 truncate">
                    {item.title}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate mt-1">
                    {item.shopName}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6 px-2">
            {sortedItems.map((item) => (
              <div key={item.id} className="group">
                <div className="relative aspect-[3/4] rounded-[2rem] overflow-hidden shadow-md bg-slate-50 border-2 border-white mb-3 flex items-center justify-center">
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-full h-full object-contain rounded-[2rem] cursor-pointer group-hover:scale-110 transition-transform duration-500"
                    onClick={() => setPreviewImage(item.imageUrl)}
                  />
                  <div className="absolute top-3 right-3 flex flex-col gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(item.imageUrl);
                      }}
                      className={`w-8 h-8 backdrop-blur-md rounded-full flex items-center justify-center shadow-sm transition-opacity ${
                        likedLooks.includes(item.imageUrl)
                          ? 'bg-red-500/90 text-white opacity-100'
                          : 'bg-white/80 text-slate-900 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <span className="text-xs">{likedLooks.includes(item.imageUrl) ? '❤️' : '🤍'}</span>
                    </button>
                    {onUpload && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpload(item.imageUrl);
                        }}
                        className="w-8 h-8 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-slate-900 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span className="text-sm">◎</span>
                      </button>
                    )}
                    {item.isUserUploaded && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteGarment(item.imageUrl);
                        }}
                        className="w-8 h-8 bg-red-500/80 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span className="text-sm">✕</span>
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-900 truncate px-2">
                  {item.title}
                </p>
                <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400 truncate px-2">
                  {item.shopName}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <FullscreenPreview image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
};

export default UploadBox;
