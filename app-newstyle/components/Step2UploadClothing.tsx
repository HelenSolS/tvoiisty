import React, { useState } from 'react';
import { Dropzone } from './Dropzone';
import { MOCK_SHOPS } from '../constants';
import { FullscreenPreview } from './FullscreenPreview';
import { AppState } from '../types';

interface Step2UploadClothingProps {
  onUpload: (base64: string) => void;
  t: any;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  backendLooks?: { id: string; imageUrl: string }[];
}

export const Step2UploadClothing: React.FC<Step2UploadClothingProps> = ({ onUpload, t, state, setState, backendLooks }) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [galleryMode, setGalleryMode] = useState<'grid' | 'scroll'>('grid');
  const [showUpload, setShowUpload] = useState(false);

  const deleteGarment = (img: string) => {
    setState(prev => {
      const garmentMemory = prev.auth?.garmentMemory || [];
      return {
        ...prev,
        auth: {
          ...prev.auth,
          garmentMemory: garmentMemory.filter(p => p !== img)
        }
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

  // В продакшене опираемся только на реальные looks из backend.
  // MOCK_SHOPS используем как мок-данные только в режиме разработки,
  // когда база ещё пуста.
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

  return (
    <div className="flex flex-col items-center px-6 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
      <div className="w-full max-w-md mb-6">
        <div className="flex items-center justify-between px-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">
              {t.gallery}
            </h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {(allItems?.length || 0)} ВЕЩЕЙ
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

      {/* Лёгкая зона загрузки: по "+", чуть выше карточек, в том же экране */}
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
                  // Важно: загрузка новой вещи НЕ запускает примерку.
                  // Мы просто кладём её в память пользователя, а примерка
                  // запускается отдельно через кружок ◎ на карточке.
                  setState(prev => {
                    const current = prev.auth?.garmentMemory || [];
                    const userPhotos = prev.auth?.userPhotos || [];
                    const historyUrls = (prev.auth?.lookHistory || []).map(h => h.imageUrl).filter(Boolean);

                    // В гардероб не допускаем людей и результаты примерок.
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

      {/* Ниже — галерея образов и загруженных вещей */}
      <div className="w-full max-w-md">

        {galleryMode === 'scroll' ? (
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-10 -mx-6 px-6 snap-x">
            {allItems.map((item) => (
              <div
                key={item.id}
                className="flex-shrink-0 w-[80vw] max-w-[320px] snap-center group"
              >
                <div className="relative aspect-[3/4] rounded-[3rem] overflow-hidden shadow-xl group-hover:shadow-2xl transition-all duration-700 mb-6 bg-slate-50 border-4 border-white flex items-center justify-center">
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-full h-full object-contain rounded-[3rem] group-hover:scale-105 transition-transform duration-1000 cursor-pointer"
                    onClick={() => setPreviewImage(item.imageUrl)}
                  />
                <div className="absolute top-6 right-6 flex flex-col gap-3">
                  {/* Кружок "Примерить" — только для backend-образов с lookId */}
                  {onUpload && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpload(item.imageUrl);
                      }}
                      className="w-12 h-12 bg-white/80 backdrop-blur-xl rounded-full flex items-center justify-center text-slate-900 shadow-xl"
                    >
                      <span className="text-xl">◎</span>
                    </button>
                  )}
                  {/* Кружок "Удалить" только для своих загрузок */}
                  {item.isUserUploaded && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteGarment(item.imageUrl);
                      }}
                      className="w-12 h-12 bg-red-500/80 backdrop-blur-xl rounded-full flex items-center justify-center text-white shadow-xl"
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
            {allItems.map((item) => (
              <div key={item.id} className="group">
                <div className="relative aspect-[3/4] rounded-[2rem] overflow-hidden shadow-md bg-slate-50 border-2 border-white mb-3 flex items-center justify-center">
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-full h-full object-contain rounded-[2rem] cursor-pointer group-hover:scale-110 transition-transform duration-500"
                    onClick={() => setPreviewImage(item.imageUrl)}
                  />
                  <div className="absolute top-3 right-3 flex flex-col gap-2">
                    {/* Кружок "Примерить" — только для backend-образов с lookId */}
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
                    {/* Кружок "Удалить" для своих */}
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
