import React, { useState } from 'react';
import { Dropzone } from './Dropzone';
import { AppState } from '../types';
import { FullscreenPreview } from './FullscreenPreview';

interface Step1UploadUserProps {
  // Загрузка НОВОГО фото (из файла / Dropzone)
  onUploadNew: (base64: string) => void;
  // Выбор уже сохранённого фото для примерки
  onSelectPhoto: (url: string) => void;
  t: any;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export const Step1UploadUser: React.FC<Step1UploadUserProps> = ({ onUploadNew, onSelectPhoto, t, state, setState }) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const userPhotos = state.auth?.userPhotos || [];
  const hasPhotos = userPhotos.length > 0;

  // Если фото ещё нет — сразу показываем большую зону загрузки.
  // Если фото уже есть — по умолчанию зона спрятана, "+" открывает прямой выбор файла.
  const [showUpload, setShowUpload] = useState(!hasPhotos);
  // Для единообразия с галереей:
  // grid  → сетка иконок
  // list  → горизонтальный слайдер крупных карточек
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const deletePhoto = (img: string) => {
    setState(prev => {
      const current = prev.auth?.userPhotos || [];
      return {
        ...prev,
        auth: {
          ...prev.auth,
          userPhotos: current.filter(p => p !== img)
        }
      };
    });
  };

  return (
    <div className="flex flex-col items-center px-6 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
      {/* Заголовок + переключатели режимов и "+" как в каноне интерфейса */}
      <div className="w-full max-w-md mb-6">
        <div className="flex items-center justify-between px-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">МОИ ФОТО</h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {(userPhotos?.length || 0)} ШТ.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {/* Режимы просмотра: иконки (grid) / крупный (list) */}
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
            {/* Кнопка "+" для загрузки нового фото */}
            <button
              onClick={() => {
                if (hasPhotos) {
                  // Если фото уже есть — сразу открываем системный выбор файла.
                  const input = document.getElementById('user-photo-file-input') as HTMLInputElement | null;
                  input?.click();
                } else {
                  // Если фото нет совсем — показываем большую зону загрузки.
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

      {/* Скрытый input для быстрого выбора файла, когда фото уже есть */}
      <input
        id="user-photo-file-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result;
            if (typeof result === 'string') {
              onUploadNew(result);
            }
          };
          reader.readAsDataURL(file);
          // Сбрасываем значение, чтобы повторный выбор того же файла тоже срабатывал
          e.target.value = '';
        }}
      />

      {/* Лёгкая зона загрузки: для первого фото или по желанию, в том же экране */}
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
                  onUploadNew(img);
                  setShowUpload(false);
                }}
                placeholder={t.clickToUpload}
              />
            </div>
          </div>
        </div>
      )}

      {/* Ниже — "МОИ ФОТО" с кружками, как и раньше */}
      <div className="w-full max-w-md">
        {userPhotos.length > 0 ? (
          viewMode === 'list' ? (
            // Крупный горизонтальный слайдер
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-6 -mx-6 px-6 snap-x">
              {userPhotos.map((img, idx) => (
                <div key={idx} className="flex-shrink-0 w-40 snap-start group relative">
                  <div className="aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-xl bg-slate-50 border-4 border-white group-hover:shadow-2xl transition-all duration-700">
                    <img
                      src={img}
                      alt={`User ${idx}`}
                      className="w-full h-full object-cover cursor-pointer group-hover:scale-110 transition-transform duration-1000"
                      onClick={() => setPreviewImage(img)}
                    />
                    <div className="absolute top-3 right-3 flex flex-col gap-2">
                      {/* Кружок "Выбрать для примерки" */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPhoto(img);
                        }}
                        className="w-8 h-8 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-slate-900 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span className="text-xs">◎</span>
                      </button>
                      {/* Кружок "Удалить" */}
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
            // Сетка иконок
            <div className="grid grid-cols-2 gap-6 px-2 pb-6">
              {userPhotos.map((img, idx) => (
                <div key={idx} className="group relative">
                  <div className="relative aspect-[3/4] rounded-[2rem] overflow-hidden shadow-md bg-slate-50 border-2 border-white mb-3">
                    <img
                      src={img}
                      alt={`User ${idx}`}
                      className="w-full h-full object-cover cursor-pointer group-hover:scale-110 transition-transform duration-500"
                      onClick={() => setPreviewImage(img)}
                    />
                    <div className="absolute top-3 right-3 flex flex-col gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPhoto(img);
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
};
