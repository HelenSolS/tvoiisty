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
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [stableOrderIds, setStableOrderIds] = useState<string[]>([]);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [onlyLiked, setOnlyLiked] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Какой элемент сейчас показывает видео-слой
  const [videoLayerId, setVideoLayerId] = useState<string | null>(null);
  // Какой элемент сейчас анимируется
  const [animatingId, setAnimatingId] = useState<string | null>(null);

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

  const deleteLook = async (id: string) => {
    if (!onDelete || deletingIds.includes(id)) return;
    setDeletingIds((prev) => [...prev, id]);
    try {
      await onDelete(id);
    } finally {
      setDeletingIds((prev) => prev.filter((x) => x !== id));
    }
  };

  const handleDownload = (imgUrl: string) => {
    // Открываем в новой вкладке — работает на мобильном и десктопе.
    // На iOS пользователь сохраняет через долгое нажатие.
    window.open(imgUrl, '_blank', 'noopener');
  };

  const handleShare = (imgUrl: string) => {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(imgUrl)}`;
    window.open(shareUrl, '_blank', 'noopener');
  };

  const handleDeleteClick = (id: string) => {
    if (confirmDeleteId === id) {
      // Второй тап — подтверждаем удаление
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmDeleteId(null);
      void deleteLook(id);
    } else {
      // Первый тап — показываем подтверждение, сбрасываем через 3 сек
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmDeleteId(id);
      confirmTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 3000);
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

  // Строка-ключ из liked-статусов — меняется только когда лайкают/снимают.
  const likedKey = useMemo(
    () => items.map((x) => `${x.id}:${x.liked ? 1 : 0}`).join(','),
    [items],
  );

  // При первой загрузке — фиксируем порядок.
  useEffect(() => {
    if (stableOrderIds.length === 0 && sortedForInitialOrder.length > 0) {
      setStableOrderIds(sortedForInitialOrder.map((x) => x.id));
    }
  }, [sortedForInitialOrder, stableOrderIds.length]);

  // При изменении лайков — пересортируем (лайкнутые всплывают вверх).
  useEffect(() => {
    if (stableOrderIds.length > 0) {
      setStableOrderIds(sortedForInitialOrder.map((x) => x.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likedKey]);

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

  const likedCount = items.filter((x) => !!x.liked).length;
  const visibleItems = onlyLiked ? displayItems.filter((x) => !!x.liked) : displayItems;

  return (
    <div className="px-6 animate-in fade-in duration-700">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-black tracking-tighter uppercase">{t.history}</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{displayItems?.length || 0} ОБРАЗОВ</p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Фильтр "только избранное" */}
          <button
            onClick={() => setOnlyLiked((v) => !v)}
            className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
              onlyLiked ? 'bg-red-500 text-white shadow-md' : 'bg-slate-100 text-slate-400'
            }`}
            title="Только избранное"
          >
            <span className="text-sm leading-none">{onlyLiked ? '♥' : '♡'}</span>
            {likedCount > 0 && <span>{likedCount}</span>}
          </button>
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

      {onlyLiked && likedCount === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-4xl mb-4">♡</span>
          <p className="text-sm font-bold uppercase tracking-widest text-slate-300">Нет избранных образов</p>
        </div>
      )}
      {viewMode === 'list' ? (
        <div className="space-y-10 pb-6">
          {visibleItems.map((item, idx) => {
            const isLiked = !!item.liked;
            const hasVideo = !!item.videoUrl;
            const showVideo = videoLayerId === item.id && hasVideo;
            const isAnimating = animatingId === item.id;

            const handleAnimate = async () => {
              if (isAnimating || !onReanimate) return;
              setAnimatingId(item.id);
              setVideoLayerId(null);
              try { await onReanimate(item.id); } finally { setAnimatingId(null); }
            };

            return (
              <div key={item.id} className="max-w-md mx-auto w-full">

                {showVideo && item.videoUrl ? (
                  /* ── СЛОЙ ВИДЕО ── */
                  <>
                    <div className="aspect-[9/16] rounded-[2.5rem] overflow-hidden shadow-xl border-4 border-white relative bg-slate-50">
                      <video
                        src={item.videoUrl}
                        autoPlay loop playsInline muted
                        className="w-full h-full object-cover rounded-[2.2rem]"
                      />
                      {/* Кнопки на видео */}
                      <div className="absolute top-4 right-4 flex flex-col gap-2.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleLike(item.id, item.imageUrl); }}
                          className={`w-11 h-11 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center transition-all active:scale-90 ${isLiked ? 'text-red-500' : 'text-slate-400'}`}
                        >
                          <span className="text-lg leading-none">{isLiked ? '♥' : '♡'}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(item.id); }}
                          disabled={deletingIds.includes(item.id)}
                          className={`w-11 h-11 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center transition-all active:scale-90 disabled:opacity-40 ${confirmDeleteId === item.id ? 'bg-red-500 text-white' : 'text-slate-300'}`}
                          title={confirmDeleteId === item.id ? 'Нажмите ещё раз — удалить' : 'Удалить'}
                        >
                          {confirmDeleteId === item.id
                            ? <span className="text-[9px] font-black uppercase leading-none">Удалить?</span>
                            : <span className="text-xl font-light leading-none">×</span>}
                        </button>
                      </div>
                    </div>
                    {/* Действия под видео */}
                    <div className="mt-4 px-2 flex items-center justify-between">
                      <button
                        onClick={() => setVideoLayerId(null)}
                        className="h-10 px-4 rounded-full bg-white shadow-md border border-slate-100 flex items-center gap-2 text-slate-600 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                      >
                        <span className="text-sm">←</span><span>К фото</span>
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAnimate(); }}
                          disabled={isAnimating}
                          className="w-11 h-11 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90 disabled:opacity-40"
                          title="Переанимировать (старая удалится)"
                        >
                          {isAnimating
                            ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                            : <span className="text-base leading-none">▷</span>}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(item.videoUrl!); }}
                          className="w-11 h-11 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90"
                          title="Скачать видео"
                        ><span className="text-base leading-none">↓</span></button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleShare(item.videoUrl!); }}
                          className="w-11 h-11 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90"
                          title="Поделиться видео"
                        ><span className="text-base leading-none">↗</span></button>
                      </div>
                    </div>
                  </>
                ) : (
                  /* ── СЛОЙ ФОТО ── */
                  <>
                    <div className="aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-xl border-4 border-white relative bg-slate-50 flex items-center justify-center">
                      <img
                        src={item.imageUrl}
                        alt={`Look ${idx}`}
                        className="w-full h-full object-contain rounded-[2.5rem]"
                      />
                      <div className="absolute top-4 right-4 flex flex-col gap-2.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleLike(item.id, item.imageUrl); }}
                          className={`w-11 h-11 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center transition-all active:scale-90 ${isLiked ? 'text-red-500' : 'text-slate-400'}`}
                        ><span className="text-lg leading-none">{isLiked ? '♥' : '♡'}</span></button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(item.id); }}
                          disabled={deletingIds.includes(item.id)}
                          className={`w-11 h-11 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center transition-all active:scale-90 disabled:opacity-40 ${confirmDeleteId === item.id ? 'bg-red-500 text-white shadow-lg' : 'text-slate-300'}`}
                          title={confirmDeleteId === item.id ? 'Нажмите ещё раз — удалить' : 'Удалить'}
                        >
                          {confirmDeleteId === item.id
                            ? <span className="text-[9px] font-black uppercase leading-none">Удалить?</span>
                            : <span className="text-xl font-light leading-none">×</span>}
                        </button>
                      </div>
                      {item.isNew && <span className="absolute top-4 left-4 w-3 h-3 rounded-full bg-[var(--primary)] shadow-md" />}
                    </div>

                    {/* Вкладка анимации / статус */}
                    {isAnimating ? (
                      <div className="mt-2 w-full h-10 rounded-[1.5rem] bg-slate-50 border border-slate-100 flex items-center justify-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                        <div className="w-3.5 h-3.5 border-2 border-slate-200 border-t-[var(--primary)] rounded-full animate-spin" />
                        <span>Создаём анимацию…</span>
                      </div>
                    ) : hasVideo ? (
                      <button
                        onClick={() => setVideoLayerId(item.id)}
                        className="mt-2 w-full h-10 rounded-[1.5rem] bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center gap-2 text-[var(--primary)] text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 hover:bg-[var(--primary)]/20"
                      >
                        <span className="text-sm">▶</span>
                        <span>Посмотреть анимацию</span>
                      </button>
                    ) : null}

                    {/* Action bar */}
                    <div className="mt-3 px-2 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                        {item.isNew ? 'НОВОЕ' : isLiked ? 'ИЗБРАННОЕ' : `#${items.length - idx}`}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAnimate(); }}
                          disabled={isAnimating}
                          className="w-11 h-11 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90 disabled:opacity-40"
                          title={hasVideo ? 'Переанимировать (старая удалится)' : 'Анимировать'}
                        >
                          {isAnimating
                            ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                            : <span className="text-base leading-none">▷</span>}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(item.imageUrl); }}
                          className="w-11 h-11 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90"
                          title="Скачать фото"
                        ><span className="text-base leading-none">↓</span></button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleShare(item.imageUrl); }}
                          className="w-11 h-11 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90"
                          title="Поделиться фото"
                        ><span className="text-base leading-none">↗</span></button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 pb-6">
          {visibleItems.map((item, idx) => {
            const isLiked = !!item.liked;
            return (
              <div key={item.id} className="flex flex-col">
                {/* Card */}
                <div className="relative aspect-[3/4] rounded-[2rem] overflow-hidden shadow-md border-2 border-white bg-slate-50 flex items-center justify-center">
                  <img
                    src={item.imageUrl}
                    alt={`Look ${idx}`}
                    className="w-full h-full object-contain rounded-[2rem]"
                  />
                  {/* Like — top right, always visible */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleLike(item.id, item.imageUrl); }}
                    className={`absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center transition-all active:scale-90 ${isLiked ? 'text-red-500' : 'text-slate-300'}`}
                  >
                    <span className="text-sm leading-none">{isLiked ? '♥' : '♡'}</span>
                  </button>
                  {/* New dot */}
                  {item.isNew && (
                    <span className="absolute top-2.5 left-2.5 w-2.5 h-2.5 rounded-full bg-[var(--primary)]" />
                  )}
                  {/* Индикатор — есть видео (кликабельный) */}
                  {item.videoUrl && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewVideo(item.videoUrl!); }}
                      className="absolute bottom-2.5 left-2.5 w-9 h-9 bg-white/95 rounded-full flex items-center justify-center text-slate-600 shadow-md border border-slate-100 active:scale-90 transition-all"
                      title="Смотреть анимацию"
                    >
                      <span className="text-[11px] leading-none">▶</span>
                    </button>
                  )}
                </div>
                {/* Mini action row */}
                <div className="mt-2 flex gap-1.5 justify-end px-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteClick(item.id); }}
                    disabled={deletingIds.includes(item.id)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm active:scale-90 transition-all disabled:opacity-40 ${confirmDeleteId === item.id ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-300'}`}
                    title={confirmDeleteId === item.id ? 'Нажмите ещё раз — удалить' : 'Удалить'}
                  >
                    <span className="leading-none font-light">×</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDownload(item.imageUrl); }}
                    className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-sm active:scale-90 transition-all"
                    title="Открыть / сохранить"
                  >
                    <span className="leading-none">↓</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleShare(item.imageUrl); }}
                    className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-sm active:scale-90 transition-all"
                    title="Поделиться в Telegram"
                  >
                    <span className="leading-none">↗</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onReanimate?.(item.id); }}
                    className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-sm active:scale-90 transition-all"
                    title={item.videoUrl ? 'Переанимировать (старая удалится)' : 'Анимировать'}
                  >
                    <span className="leading-none">▷</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FullscreenPreview image={previewImage} onClose={() => setPreviewImage(null)} />

      {/* Fullscreen video preview (grid mode) */}
      {previewVideo && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center"
          onClick={() => setPreviewVideo(null)}
        >
          <div className="relative w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <video
              src={previewVideo}
              autoPlay loop playsInline muted
              className="w-full rounded-[2rem] object-cover"
              style={{ aspectRatio: '9/16' }}
            />
          </div>
          <button
            onClick={() => setPreviewVideo(null)}
            className="mt-6 h-11 px-6 bg-white/15 backdrop-blur-sm border border-white/30 rounded-full text-white font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all"
          >
            ← К фото
          </button>
        </div>
      )}
    </div>
  );
};
