import React, { useState } from 'react';
import { FullscreenPreview } from './FullscreenPreview';
import Loader from './Loader';

export interface ResultViewProps {
  image: string | null;
  isProcessing: boolean;
  onCreateVideo: () => void;
  onReset: () => void;
  t: any;
  error?: string | null;
  onRetry?: () => void;
  onChooseAnother?: () => void;
}

const ResultView: React.FC<ResultViewProps> = ({
  image,
  isProcessing,
  onCreateVideo,
  onReset,
  t,
  error,
  onRetry,
  onChooseAnother,
}) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleDownload = () => {
    if (!image) return;
    window.open(image, '_blank');
  };

  const handleShareTelegram = () => {
    if (!image) return;
    if (typeof window === 'undefined') return;
    const url = encodeURIComponent(image);
    const shareUrl = `https://t.me/share/url?url=${url}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="w-full max-w-md bg-white rounded-[3rem] p-8 shadow-2xl border border-slate-100 overflow-hidden">
        <div className="relative aspect-[3/4] w-full bg-slate-50 rounded-[2.5rem] overflow-hidden mb-8 group flex items-center justify-center p-2">
          {isProcessing ? (
            <Loader t={t} />
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <span className="text-4xl mb-4">⚠️</span>
              <h3 className="text-lg font-black tracking-tight mb-2">
                Не удалось создать примерку
              </h3>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-6">
                Попробуйте ещё раз или выберите другой образ
              </p>
            </div>
          ) : image ? (
            <img
                src={image}
                alt="Result"
                className="max-w-full max-h-full object-contain rounded-[2.2rem] animate-in zoom-in duration-1000 cursor-pointer"
                onClick={() => setIsPreviewOpen(true)}
              />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
              <span className="text-5xl mb-4">✨</span>
              <p className="text-sm font-bold uppercase tracking-widest">{t.resultPlaceholder}</p>
            </div>
          )}
        </div>

        {!isProcessing && error && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={onRetry}
                className="py-5 bg-[var(--bg-gradient)] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:scale-[1.02] transition-transform active:scale-95 shadow-[var(--primary)]/20"
              >
                Повторить
              </button>
              <button
                onClick={onChooseAnother}
                className="py-5 bg-white text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-slate-50 transition-all active:scale-95 border border-slate-100"
              >
                Выбрать другой образ
              </button>
            </div>
            <button
              onClick={onReset}
              className="w-full py-4 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              {t.back}
            </button>
          </div>
        )}

        {image && !isProcessing && !error && (
          <div className="space-y-3">
            {/* Action bar — всегда видимые кнопки */}
            <div className="flex items-center justify-between px-1">
              <button
                onClick={onReset}
                className="text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                {t.back}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onCreateVideo}
                  className="w-11 h-11 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-600 transition-all active:scale-90"
                  title={t.createVideo}
                >
                  <span className="text-base leading-none">▷</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="w-11 h-11 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-600 transition-all active:scale-90"
                  title={t.download}
                >
                  <span className="text-base leading-none">↓</span>
                </button>
                <button
                  onClick={handleShareTelegram}
                  className="w-11 h-11 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-600 transition-all active:scale-90"
                  title={t.share}
                >
                  <span className="text-base leading-none">↗</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <FullscreenPreview image={isPreviewOpen ? image : null} onClose={() => setIsPreviewOpen(false)} />
    </div>
  );
};

export default ResultView;


