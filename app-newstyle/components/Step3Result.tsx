import React, { useState } from 'react';
import { FullscreenPreview } from './FullscreenPreview';

interface Step3ResultProps {
  image: string | null;
  isProcessing: boolean;
  onCreateVideo: () => void;
  onReset: () => void;
  t: any;
  error?: string | null;
  onRetry?: () => void;
  onChooseAnother?: () => void;
}

export const Step3Result: React.FC<Step3ResultProps> = ({
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

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="w-full max-w-md bg-white rounded-[3rem] p-8 shadow-2xl border border-slate-100 overflow-hidden">
        <div className="relative aspect-[3/4] w-full bg-slate-50 rounded-[2.5rem] overflow-hidden mb-8 group">
          {isProcessing ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-12 h-12 border-4 border-slate-100 border-t-[var(--primary)] rounded-full animate-spin mb-6"></div>
              <h3 className="text-xl font-black tracking-tight">{t.resultPlaceholder}...</h3>
            </div>
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
              className="w-full h-full object-cover animate-in zoom-in duration-1000 cursor-pointer"
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
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={onCreateVideo}
                className="py-5 bg-[var(--bg-gradient)] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:scale-[1.02] transition-transform active:scale-95 shadow-[var(--primary)]/20"
              >
                {t.createVideo}
              </button>
              <button
                className="py-5 bg-white text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-slate-50 transition-all active:scale-95 border border-slate-100"
              >
                {t.download}
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
      </div>

      <FullscreenPreview image={isPreviewOpen ? image : null} onClose={() => setIsPreviewOpen(false)} />
    </div>
  );
};
