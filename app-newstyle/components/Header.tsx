import React, { useState } from 'react';
import { Theme, AppState, Language, UserRole } from '../types';

interface HeaderProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  language: Language;
  setCurrentStep: (step: number) => void;
  setView: (view: 'home' | 'settings' | 'adminTest') => void;
  t: any;
}

export const Header: React.FC<HeaderProps> = ({ state, setState, language, setCurrentStep, setView, t }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleTheme = (theme: Theme) => {
    setState(prev => ({ ...prev, theme }));
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-[100] px-6 py-4 flex items-center justify-between glass">
        <div 
          className="flex items-center gap-2 cursor-pointer group" 
          onClick={() => { setView('home'); setCurrentStep(1); setIsMenuOpen(false); }}
        >
          <div className="w-8 h-8 bg-[var(--bg-gradient)] rounded-lg flex items-center justify-center shadow-md transform group-hover:rotate-6 transition-transform border border-white/20">
             <span className="text-white font-black text-[10px] drop-shadow-sm">ИИ</span>
          </div>
          <span className="font-black text-xl tracking-tighter text-slate-900">Твой <span className="text-[var(--primary)]">ИИ</span>стиль</span>
        </div>

        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="w-10 h-10 flex flex-col items-center justify-center gap-1.5 bg-white rounded-full shadow-md active:scale-90 transition-all"
        >
          <div className={`w-5 h-0.5 bg-slate-900 rounded-full transition-all ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></div>
          <div className={`w-5 h-0.5 bg-slate-900 rounded-full transition-all ${isMenuOpen ? 'opacity-0' : ''}`}></div>
          <div className={`w-5 h-0.5 bg-slate-900 rounded-full transition-all ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></div>
        </button>
      </header>

      {/* Slide-out Menu */}
      <div className={`fixed inset-0 z-[90] transition-all duration-500 ${isMenuOpen ? 'visible' : 'invisible'}`}>
        <div 
          className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-500 ${isMenuOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsMenuOpen(false)}
        ></div>
        
        <div className={`absolute right-0 top-0 bottom-0 w-80 bg-white shadow-2xl p-10 flex flex-col transition-transform duration-500 ease-out ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex-1 space-y-8 mt-16">
            <nav className="flex flex-col gap-6">
              <button 
                onClick={() => { setView('home'); setCurrentStep(0); setIsMenuOpen(false); }}
                className="text-2xl font-black tracking-tight text-left hover:text-[var(--primary)] transition-colors"
              >
                {t.home}
              </button>
              <button 
                onClick={() => { setView('home'); setCurrentStep(1); setIsMenuOpen(false); }}
                className="text-2xl font-black tracking-tight text-left hover:text-[var(--primary)] transition-colors"
              >
                {t.quickTryon}
              </button>
              <button 
                onClick={() => { setView('home'); setCurrentStep(2); setIsMenuOpen(false); }}
                className="text-2xl font-black tracking-tight text-left hover:text-[var(--primary)] transition-colors"
              >
                {t.gallery}
              </button>
              <button 
                onClick={() => { setView('home'); setCurrentStep(5); setIsMenuOpen(false); }}
                className="text-2xl font-black tracking-tight text-left hover:text-[var(--primary)] transition-colors"
              >
                {t.history}
              </button>
              <button 
                onClick={() => { setView('adminTest'); setIsMenuOpen(false); }}
                className="text-2xl font-black tracking-tight text-left text-red-500 hover:text-red-600 transition-colors"
              >
                !тест админ
              </button>
              {state.role === UserRole.ADMIN && (
                <button 
                  onClick={() => { setView('settings'); setIsMenuOpen(false); }}
                  className="text-2xl font-black tracking-tight text-left text-red-500 transition-colors"
                >
                  Админ
                </button>
              )}
            </nav>

            <div className="pt-8 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{t.theme}</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => toggleTheme(Theme.LAVENDER)}
                  className={`w-8 h-8 rounded-full border-2 ${state.theme === Theme.LAVENDER ? 'border-slate-900' : 'border-transparent'}`}
                  style={{ background: '#6E6BD9' }}
                ></button>
                <button 
                  onClick={() => toggleTheme(Theme.MINT)}
                  className={`w-8 h-8 rounded-full border-2 ${state.theme === Theme.MINT ? 'border-slate-900' : 'border-transparent'}`}
                  style={{ background: '#79E0C6' }}
                ></button>
                <button 
                  onClick={() => toggleTheme(Theme.PEACH)}
                  className={`w-8 h-8 rounded-full border-2 ${state.theme === Theme.PEACH ? 'border-slate-900' : 'border-transparent'}`}
                  style={{ background: '#FFC9A9' }}
                ></button>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <button 
              onClick={() => setState(prev => ({ ...prev, auth: { ...prev.auth, isLoggedIn: false } }))}
              className="text-sm font-bold text-red-500 uppercase tracking-widest"
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
