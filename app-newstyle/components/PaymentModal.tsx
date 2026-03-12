import React from 'react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onSuccess }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-sm bg-white rounded-[3rem] shadow-2xl p-10 animate-in zoom-in duration-300 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mx-auto flex items-center justify-center shadow-xl mb-6">
           <span className="text-white text-2xl">✨</span>
        </div>
        <h2 className="text-3xl font-black tracking-tighter uppercase leading-none">UPGRADE MAGIC</h2>
        <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest mt-3">Будущее стиля в ваших руках</p>

        <div className="mt-8 space-y-4 text-left">
           {[
             { title: '100 Примерок', desc: 'Ежедневный лимит на образы' },
             { title: 'Видео-Магия', desc: 'Анимация луков с Veo AI' },
             { title: 'VIP Доступ', desc: 'Персональный помощник ИИ' }
           ].map((feat, i) => (
             <div key={i} className="flex gap-3 items-start">
                <div className="w-4 h-4 rounded-full bg-green-50 flex items-center justify-center text-green-500 shrink-0 border border-green-100 mt-0.5">
                   <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                   <p className="text-[9px] font-black uppercase tracking-widest leading-none text-slate-900">{feat.title}</p>
                   <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-1">{feat.desc}</p>
                </div>
             </div>
           ))}
        </div>

        <div className="my-8 py-6 bg-slate-50 rounded-2xl border border-slate-50">
           <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 mb-1">Месячный доступ</p>
           <p className="text-3xl font-black tracking-tighter">МАГИЯ 2026</p>
        </div>

        <button 
          onClick={onSuccess}
          className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black active:scale-95 transition-all"
        >
          ПОЛУЧИТЬ ДОСТУП
        </button>
        <p className="text-[8px] text-slate-200 uppercase font-black mt-6 tracking-widest">Безопасная оплата</p>
      </div>
    </div>
  );
};