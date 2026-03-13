import React, { useState } from 'react';
import { FullscreenPreview } from './FullscreenPreview';
import { AppState, LookHistoryItem } from '../types';

interface LookScrollerProps {
  items: LookHistoryItem[];
  t: any;
  onReset: () => void;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export const LookScroller: React.FC<LookScrollerProps> = ({ items, t, onReset, state, setState }) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  const likedLooks = state.auth.likedLooks || [];

  const toggleLike = (img: string) => {
    setState(prev => {
      const currentLiked = prev.auth.likedLooks || [];
      const isLiked = currentLiked.includes(img);
      const newLiked = isLiked 
        ? currentLiked.filter(url => url !== img)
        : [img, ...currentLiked];
      
      return {
        ...prev,
        auth: { ...prev.auth, likedLooks: newLiked }
      };
    });
  };

  const deleteLook = (id: string) => {
    setState(prev => {
      const lookHistory = prev.auth?.lookHistory || [];
      return {
        ...prev,
        auth: {
          ...prev.auth,
          lookHistory: lookHistory.filter(item => item.id !== id)
        }
      };
    });
  };

  const handleDownload = async (imgUrl: string) => {
    try {
      const response = await fetch(imgUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `look-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed", err);
      alert("Не удалось скачать изображение");
    }
  };

  // Sort: liked items first
  const sortedItems = [...items].sort((a, b) => {
    const aLiked = likedLooks.includes(a.imageUrl);
    const bLiked = likedLooks.includes(b.imageUrl);
    if (aLiked && !bLiked) return -1;
    if (!aLiked && bLiked) return 1;
    return 0;
  });

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-10">
        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-slate-200">
          <span className="text-4xl">✨</span>
        </div>
        <h3 className="text-2xl font-black tracking-tighter mb-4 uppercase">{t.history}</h3>
        <p className="text-sm text-slate-400 font-bold uppercase tracking-widest leading-relaxed mb-8">
          {t.noHistory}
        </p>
        <button 
          onClick={onReset}
          className="px-10 py-4 bg-[var(--bg-gradient)] text-white rounded-full font-black text-[10px] uppercase tracking-widest shadow-xl"
        >
          {t.next}
        </button>
      </div>
    );
  }

  return (
    <div className="px-6 animate-in fade-in duration-700">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tighter uppercase">{t.history}</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{items?.length || 0} ОБРАЗОВ</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setViewMode('grid')}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${viewMode === 'grid' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}
          >
            <span className="text-xs">⊞</span>
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${viewMode === 'list' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}
          >
            <span className="text-xs">≡</span>
          </button>
          <button 
            onClick={onReset}
            className="w-10 h-10 bg-[var(--bg-gradient)] text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform ml-2"
          >
            <span className="text-xl">+</span>
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-16">
          {sortedItems.map((item, idx) => {
            const isLiked = likedLooks.includes(item.imageUrl);
            return (
              <div key={item.id} className="group relative">
                <div className="aspect-[3/4] rounded-[3.5rem] overflow-hidden shadow-2xl border-8 border-white relative bg-slate-50">
                  <img 
                    src={item.imageUrl} 
                    alt={`Look ${idx}`} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000 cursor-pointer"
                    onClick={() => setPreviewImage(item.imageUrl)}
                  />
                  <div className="absolute top-8 right-8 flex flex-col gap-4">
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleLike(item.imageUrl); }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-xl transition-all shadow-xl ${isLiked ? 'bg-red-500 text-white' : 'bg-white/20 text-white hover:bg-white/40'}`}
                    >
                      <span className="text-sm">{isLiked ? '❤️' : '🤍'}</span>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteLook(item.id); }}
                      className="w-9 h-9 bg-red-500/80 backdrop-blur-xl rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    >
                      <span className="text-sm">✕</span>
                    </button>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-transparent to-transparent p-10 flex items-end justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex gap-4">
                       {item.videoUrl && (
                         <button 
                           onClick={(e) => { e.stopPropagation(); window.open(item.videoUrl, '_blank'); }}
                           className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform"
                         >
                            <span className="text-xl">🎬</span>
                         </button>
                       )}
                       <button 
                         onClick={(e) => { e.stopPropagation(); handleDownload(item.imageUrl); }}
                         className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform"
                       >
                          <span className="text-xl">📥</span>
                       </button>
                    </div>
                  </div>
                </div>
                <div className="mt-8 flex items-center justify-between px-6">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">ОБРАЗ #{items.length - idx}</span>
                  {isLiked && <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">ИЗБРАННОЕ</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {sortedItems.map((item, idx) => {
            const isLiked = likedLooks.includes(item.imageUrl);
            return (
              <div key={item.id} className="group relative aspect-[3/4] rounded-[2rem] overflow-hidden shadow-lg border-4 border-white bg-slate-50">
                <img 
                  src={item.imageUrl} 
                  alt={`Look ${idx}`} 
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setPreviewImage(item.imageUrl)}
                />
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleLike(item.imageUrl); }}
                  className={`absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${isLiked ? 'bg-red-500 text-white' : 'bg-white/20 text-white'}`}
                >
                  <span className="text-[10px]">{isLiked ? '❤️' : '🤍'}</span>
                </button>
                {item.videoUrl && (
                  <div className="absolute bottom-3 left-3 w-7 h-7 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white">
                    <span className="text-[10px]">🎬</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <FullscreenPreview image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
};
