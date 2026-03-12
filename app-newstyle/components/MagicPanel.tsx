
import React, { useState } from 'react';
import { AppState, MagicPreset, UserRole } from '../types';
import { generateMagicVideo } from '../services/geminiService';

interface MagicPanelProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  resultImage: string | null;
  presets: MagicPreset[];
}

export const MagicPanel: React.FC<MagicPanelProps> = ({ isOpen, onClose, state, setState, resultImage, presets }) => {
  const [selectedPreset, setSelectedPreset] = useState<string>(presets[0]?.id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const handleMagicGeneration = async () => {
    if (!resultImage) {
      alert("Сначала создайте примерку. Магия работает только с готовым образом.");
      return;
    }
    
    if (state.limits.videosLeft <= 0 && state.role !== UserRole.ADMIN) {
      alert("Лимит видео на сегодня исчерпан.");
      return;
    }
    
    const preset = presets.find(p => p.id === selectedPreset);
    if (!preset) return;

    // Users must select their own API key for Veo models
    if (typeof window !== 'undefined' && window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
      }
    }

    setIsGenerating(true);
    setVideoUrl(null);
    try {
      const video = await generateMagicVideo(resultImage, preset.promptTemplate);
      if (video) {
        setVideoUrl(video);
        if (state.role !== UserRole.ADMIN) {
          setState(prev => ({
            ...prev,
            limits: { ...prev.limits, videosLeft: Math.max(0, prev.limits.videosLeft - 1) }
          }));
        }
      } else {
        alert("Ошибка видео-магии. Попробуйте еще раз.");
      }
    } catch (err: any) {
      console.error("Magic Video Error:", err);
      // If project is not found (often due to billing/key issues), reset key selection
      if (err.message?.includes("Requested entity was not found")) {
        if (typeof window !== 'undefined' && window.aistudio) {
          await window.aistudio.openSelectKey();
        }
      }
      alert("Произошла ошибка при создании видео.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col transform animate-in slide-in-from-right duration-500 overflow-hidden">
        
        <div className="px-8 pt-10 pb-6 border-b border-slate-50 flex justify-between items-center bg-white">
          <div>
            <h2 className="text-3xl font-black tracking-tighter uppercase leading-none">МАГИЯ ВИДЕО</h2>
            <p className="text-[9px] text-slate-300 font-bold uppercase tracking-[0.2em] mt-2">Оживите ваш новый образ</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 hover:bg-slate-50 rounded-xl transition-all flex items-center justify-center border border-slate-100">
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 no-scrollbar pb-32">
          {!resultImage ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-8">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tighter">НУЖЕН ОБРАЗ</h3>
                <p className="text-xs text-slate-400 font-bold leading-relaxed uppercase tracking-wider">Магия работает только на основе успешной примерки. Сначала создайте лук!</p>
              </div>
              <button 
                onClick={onClose}
                className="px-10 py-4 bg-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg"
              >
                ВЕРНУТЬСЯ К ПРИМЕРКЕ
              </button>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-50 flex items-center gap-5">
                <img src={resultImage} alt="Input" className="w-16 h-20 object-cover rounded-2xl shadow-md border-2 border-white" />
                <div>
                  <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Источник Магии</p>
                  <p className="text-sm font-black text-slate-700 uppercase tracking-tighter">Образ готов к анимации</p>
                </div>
              </div>

              <section>
                <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6 border-l-2 border-[var(--primary)] pl-3">Выбор пресета</h3>
                <div className="grid grid-cols-2 gap-4">
                  {presets.filter(p => p.active).map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset.id)}
                      className={`relative p-3 rounded-[2rem] border-2 transition-all text-left overflow-hidden ${
                        selectedPreset === preset.id 
                        ? 'border-indigo-500 bg-indigo-50/20' 
                        : 'border-slate-50 hover:border-slate-200 bg-white'
                      }`}
                    >
                      {preset.preview && (
                        <div className="w-full aspect-video rounded-2xl overflow-hidden mb-3">
                          <img src={preset.preview} alt={preset.name} className="w-full h-full object-cover grayscale-[0.2]" />
                        </div>
                      )}
                      <span className="font-black text-[10px] uppercase tracking-widest block truncate px-2">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </section>

              <div className="w-full aspect-[16/9] bg-slate-50 rounded-[3rem] overflow-hidden border border-slate-50 flex items-center justify-center relative shadow-inner group">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-4 text-center px-10">
                    <div className="w-10 h-10 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.3em] animate-pulse">ИИ творит магию...</p>
                  </div>
                ) : videoUrl ? (
                  <video src={videoUrl} controls autoPlay className="w-full h-full object-cover animate-in zoom-in duration-500" />
                ) : (
                  <div className="text-center px-10 text-slate-200">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm opacity-50">
                       <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                       </svg>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-50">Превью видео</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <button
                  onClick={handleMagicGeneration}
                  disabled={isGenerating || (state.role !== UserRole.ADMIN && state.limits.videosLeft <= 0)}
                  className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all transform active:scale-95 disabled:opacity-20"
                >
                  {isGenerating ? "СОЗДАЕМ..." : "ЗАПУСТИТЬ МАГИЮ"}
                </button>
                
                <p className="text-center text-[8px] text-slate-300 font-black uppercase tracking-[0.3em]">
                  {state.role === UserRole.ADMIN ? "БЕЗЛИМИТНЫЙ АДМИН" : `${state.limits.videosLeft} ПОПЫТОК МАГИИ ОСТАЛОСЬ`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
