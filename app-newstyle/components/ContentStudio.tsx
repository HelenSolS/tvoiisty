
import React, { useState, useEffect } from 'react';
import { generatePostCaption } from '../services/geminiService';

interface ContentStudioProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl: string | null;
  lookTitle: string;
  shopName: string;
}

export const ContentStudio: React.FC<ContentStudioProps> = ({ isOpen, onClose, mediaUrl, lookTitle, shopName }) => {
  const [captions, setCaptions] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSocial, setSelectedSocial] = useState<'ig' | 'tk' | 'tg'>('ig');

  useEffect(() => {
    if (isOpen && mediaUrl) {
      handleGenerateCaptions();
    }
  }, [isOpen]);

  const handleGenerateCaptions = async () => {
    setIsLoading(true);
    const text = await generatePostCaption(lookTitle, shopName);
    setCaptions(text);
    setIsLoading(false);
  };

  const handleDownload = () => {
    if (!mediaUrl) return;
    const link = document.createElement('a');
    link.href = mediaUrl;
    link.download = `VT_MAGIC_LOOK_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen || !mediaUrl) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        
        <div className="p-8 border-b border-slate-50 flex justify-between items-center">
          <h2 className="text-2xl font-black uppercase tracking-tighter">Студия контента</h2>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-900 transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto no-scrollbar">
          <div className="relative aspect-square rounded-[2rem] overflow-hidden bg-slate-100 shadow-inner">
            <img src={mediaUrl} alt="Post preview" className="w-full h-full object-cover" />
            <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20">
              <span className="text-[8px] font-black text-white uppercase tracking-widest">VT-MAGIC 2026</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400">ИИ-Подписи для поста</h3>
              <button onClick={handleGenerateCaptions} disabled={isLoading} className="text-[9px] font-black uppercase tracking-widest text-indigo-500 underline">Перегенерировать</button>
            </div>
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 min-h-[100px] relative">
              {isLoading ? (
                <div className="flex items-center gap-2 text-slate-300 animate-pulse">
                  <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
                  <span className="text-[9px] font-black uppercase">ИИ пишет текст...</span>
                </div>
              ) : (
                <p className="text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{captions}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'ig', label: 'Instagram' },
              { id: 'tk', label: 'TikTok' },
              { id: 'tg', label: 'Telegram' }
            ].map((soc) => (
              <button 
                key={soc.id}
                onClick={() => setSelectedSocial(soc.id as any)}
                className={`py-4 rounded-2xl border-2 transition-all text-[8px] font-black uppercase tracking-widest ${selectedSocial === soc.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-50 text-slate-300 hover:border-slate-200'}`}
              >
                {soc.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={() => { alert(`Пост отправлен в ${selectedSocial.toUpperCase()}!`); onClose(); }}
              className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-indigo-700 active:scale-95 transition-all"
            >
              Опубликовать сейчас
            </button>
            <button 
              onClick={handleDownload}
              className="w-full py-4 bg-white border border-slate-100 text-slate-400 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:border-slate-900 hover:text-slate-900 transition-all"
            >
              Скачать файл
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
