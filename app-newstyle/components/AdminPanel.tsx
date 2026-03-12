
import React from 'react';
import { AppState, UserRole, Theme, AIProvider, MagicPreset } from '../types';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  presets: MagicPreset[];
  setPresets: React.Dispatch<React.SetStateAction<MagicPreset[]>>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose, state, setState, presets, setPresets }) => {
  if (!isOpen) return null;

  const togglePreset = (id: string) => {
    setPresets(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col p-10 overflow-y-auto animate-in slide-in-from-right duration-500">
        <div className="flex items-center justify-between mb-12">
          <h2 className="text-3xl font-black tracking-tighter">Панель управления</h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-full">
            <span className="text-xl">✕</span>
          </button>
        </div>

        <section className="mb-12">
          <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mb-6">Конфигурация ИИ</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl">
              <div>
                <p className="font-bold text-slate-800 text-sm">Провайдер ИИ</p>
                <p className="text-[10px] text-slate-400 font-medium mt-1">Переключение между Gemini и Custom API</p>
              </div>
              <select 
                value={state.provider}
                onChange={(e) => setState(prev => ({ ...prev, provider: e.target.value as AIProvider }))}
                className="bg-white border-none rounded-xl text-xs font-bold px-4 py-2 shadow-sm focus:ring-2 focus:ring-[var(--primary)]"
              >
                <option value={AIProvider.GEMINI}>Gemini (Primary)</option>
                <option value={AIProvider.CUSTOM}>Custom (Imagen)</option>
              </select>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mb-6">Аналитика (24ч)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-6 rounded-3xl">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">Генерации</p>
              <p className="text-3xl font-black tracking-tighter">1,402</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">Видео</p>
              <p className="text-3xl font-black tracking-tighter">489</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">Ошибки</p>
              <p className="text-3xl font-black tracking-tighter text-green-500">0.2%</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">Активные</p>
              <p className="text-3xl font-black tracking-tighter">156</p>
            </div>
          </div>
        </section>

        <section>
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Пресеты магии</h3>
            <button className="text-[var(--primary)] text-[10px] font-black uppercase tracking-widest">+ НОВЫЙ</button>
          </div>
          <div className="space-y-3">
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:border-slate-300 transition-all">
                <span className="text-sm font-bold">{preset.name}</span>
                <button 
                  onClick={() => togglePreset(preset.id)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${preset.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}
                >
                  {preset.active ? 'АКТИВЕН' : 'ВЫКЛ'}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
