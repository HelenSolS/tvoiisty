import React, { useEffect } from 'react';

interface Step4VideoProps {
  video: string | null;
  onReset: () => void;
  onVideoCreated?: (videoUrl: string) => void;
  t: any;
}

export const Step4Video: React.FC<Step4VideoProps> = ({ video, onReset, onVideoCreated, t }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="w-full max-w-md bg-white rounded-[3rem] p-8 shadow-2xl border border-slate-100 overflow-hidden">
        <div className="relative aspect-[3/4] w-full bg-slate-50 rounded-[2.5rem] overflow-hidden mb-8">
          {video ? (
            <video src={video} controls autoPlay loop className="w-full h-full object-contain rounded-[2.5rem] animate-in zoom-in duration-1000" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
              <div className="w-12 h-12 border-4 border-slate-100 border-t-[var(--primary)] rounded-full animate-spin mb-6"></div>
              <h3 className="text-xl font-black tracking-tight">{t.createVideo}...</h3>
            </div>
          )}
        </div>

        {video && (
          <div className="space-y-4">
            <button 
              onClick={() => onVideoCreated && onVideoCreated("")}
              className="w-full py-5 bg-white text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-slate-50 transition-all active:scale-95 border border-slate-100"
            >
              {t.recreateVideo || "ПЕРЕДЕЛАТЬ"}
            </button>
            <div className="grid grid-cols-2 gap-4">
              <button 
                className="py-5 bg-[var(--bg-gradient)] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:scale-[1.02] transition-transform active:scale-95 shadow-[var(--primary)]/20"
              >
                {t.download}
              </button>
              <button 
                className="py-5 bg-white text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-slate-50 transition-all active:scale-95 border border-slate-100"
              >
                {t.share}
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
    </div>
  );
};
