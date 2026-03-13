import React, { useEffect, useMemo, useState } from 'react';
import { FullscreenPreview } from './FullscreenPreview';
import { AppState, LookHistoryItem } from '../types';

interface LookScrollerProps {
  items: LookHistoryItem[];
  t: any;
  onReset: () => void;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onLike?: (sessionId: string, liked: boolean) => void;
  onDelete?: (sessionId: string) => void;
  onReanimate?: (sessionId: string) => Promise<void> | void;
  onViewed?: (sessionIds: string[]) => void;
}

export const LookScroller: React.FC<LookScrollerProps> = ({
  items,
  t,
  onReset,
  state,
  setState,
  onLike,
  onDelete,
  onReanimate,
  onViewed,
}) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [stableOrderIds, setStableOrderIds] = useState<string[]>([]);

  const toggleLike = (sessionId: string, img: string) => {
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
    const current = items.find((x) => x.id === sessionId);
    const nextLiked = !(current?.liked ?? false);
    onLike?.(sessionId, nextLiked);
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
    onDelete?.(id);
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

  const sortedForInitialOrder = useMemo(() => {
    return [...items].sort((a, b) => {
      const aNew = !!a.isNew;
      const bNew = !!b.isNew;
      if (aNew && !bNew) return -1;
      if (!aNew && bNew) return 1;
      const aLiked = !!a.liked;
      const bLiked = !!b.liked;
      if (aLiked && !bLiked) return -1;
      if (!aLiked && bLiked) return 1;
      return Number(b.timestamp || 0) - Number(a.timestamp || 0);
    });
  }, [items]);

  useEffect(() => {
    if (stableOrderIds.length === 0 && sortedForInitialOrder.length > 0) {
      setStableOrderIds(sortedForInitialOrder.map((x) => x.id));
    }
  }, [sortedForInitialOrder, stableOrderIds.length]);

  useEffect(() => {
    const unseenIds = items.filter((x) => x.isNew).map((x) => x.id);
    if (unseenIds.length === 0) return;
    onViewed?.(unseenIds);
    // Снимаем метку "новое" локально, но не трогаем порядок прямо сейчас.
    setState((prev) => ({
      ...prev,
      auth: {
        ...prev.auth,
        lookHistory: (prev.auth.lookHistory || []).map((item) =>
          unseenIds.includes(item.id) ? { ...item, isNew: false } : item,
        ),
      },
    }));
  }, [items, onViewed, setState]);

  const displayItems = useMemo(() => {
    const byId = new Map(items.map((x) => [x.id, x]));
    const ordered: LookHistoryItem[] = [];
    for (const id of stableOrderIds) {
      const item = byId.get(id);
      if (item) ordered.push(item);
    }
    const missing = items.filter((x) => !stableOrderIds.includes(x.id));
    if (missing.length > 0) {
      return [...missing, ...ordered];
    }
    return ordered.length > 0 ? ordered : items;
  }, [items, stableOrderIds]);

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
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{displayItems?.length || 0} ОБРАЗОВ</p>
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
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-16">
          {displayItems.map((item, idx) => {
            const isLiked = !!item.liked;
            return (
              <div key={item.id} className="group relative">
                <div className="aspect-[3/4] rounded-[3.5rem] overflow-hidden shadow-2xl border-8 border-white relative bg-slate-50 flex items-center justify-center">
                  <img 
                    src={item.imageUrl} 
                    alt={`Look ${idx}`} 
                    className="w-full h-full object-contain rounded-[3.5rem] group-hover:scale-105 transition-transform duration-1000 cursor-pointer"
                    onClick={() => setPreviewImage(item.imageUrl)}
                  />
                  <div className="absolute top-8 right-8 flex flex-col gap-4">
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleLike(item.id, item.imageUrl); }}
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
                       <button 
                         onClick={(e) => { e.stopPropagation(); onReanimate?.(item.id); }}
                         className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform"
                       >
                          <span className="text-xl">🎞</span>
                       </button>
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
                  <div className="flex items-center gap-2">
                    {item.isNew && <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" title="Новое" />}
                    {isLiked && <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">ИЗБРАННОЕ</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {displayItems.map((item, idx) => {
            const isLiked = !!item.liked;
            return (
              <div key={item.id} className="group relative aspect-[3/4] rounded-[2rem] overflow-hidden shadow-lg border-4 border-white bg-slate-50 flex items-center justify-center">
                <img 
                  src={item.imageUrl} 
                  alt={`Look ${idx}`} 
                  className="w-full h-full object-contain rounded-[2rem] cursor-pointer"
                  onClick={() => setPreviewImage(item.imageUrl)}
                />
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleLike(item.id, item.imageUrl); }}
                  className={`absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${isLiked ? 'bg-red-500 text-white' : 'bg-white/20 text-white'}`}
                >
                  <span className="text-[10px]">{isLiked ? '❤️' : '🤍'}</span>
                </button>
                {item.isNew && (
                  <span className="absolute top-3 left-3 w-2.5 h-2.5 rounded-full bg-red-500" title="Новое" />
                )}
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
