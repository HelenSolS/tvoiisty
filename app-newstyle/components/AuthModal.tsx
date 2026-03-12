import React, { useState } from 'react';
import { UserRole } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (email: string, role: UserRole) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  // Demo mode: Pre-filled credentials
  const [email, setEmail] = useState('fashion@test.2026');
  const [password, setPassword] = useState('demo-key-26');
  const [role, setRole] = useState<UserRole>(UserRole.USER);
  const [isRegistering, setIsRegistering] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-sm bg-white rounded-[3rem] shadow-2xl p-10 animate-in zoom-in duration-300">
        <div className="text-center mb-10">
           <div className="w-12 h-12 bg-[var(--bg-gradient)] rounded-xl flex items-center justify-center mx-auto mb-6 shadow-xl">
             <span className="text-white font-black">AI</span>
           </div>
           <h2 className="text-2xl font-black tracking-tight mb-2 uppercase leading-none">{isRegistering ? 'Создать' : 'Вход'}</h2>
           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">
             {isRegistering ? 'Присоединяйтесь к нам' : 'С возвращением'}
           </p>
        </div>

        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          onAuthSuccess(email, role);
        }}>
          <div>
            <input 
              type="email" 
              placeholder="Email" 
              className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-[11px] font-bold focus:ring-1 focus:ring-slate-900 transition-all placeholder:text-slate-200"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <input 
              type="password" 
              placeholder="Пароль" 
              className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-[11px] font-bold focus:ring-1 focus:ring-slate-900 transition-all placeholder:text-slate-200"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="pt-2">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-300 mb-4 text-center">Роль доступа</p>
            <div className="grid grid-cols-2 gap-3">
               <button 
                 type="button"
                 onClick={() => setRole(UserRole.USER)}
                 className={`py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${role === UserRole.USER ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-50 text-slate-300'}`}
               >
                 Пользователь
               </button>
               <button 
                 type="button"
                 onClick={() => setRole(UserRole.SHOP_USER)}
                 className={`py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${role === UserRole.SHOP_USER ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-50 text-slate-300'}`}
               >
                 Магазин
               </button>
            </div>
          </div>

          <button className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all mt-6 active:scale-95">
            {isRegistering ? 'ПОДТВЕРДИТЬ' : 'ВОЙТИ СЕЙЧАС'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-50 text-center">
           <button 
             onClick={() => setIsRegistering(!isRegistering)}
             className="text-[9px] font-black uppercase tracking-widest text-slate-400"
           >
             {isRegistering ? 'УЖЕ ЕСТЬ АККАУНТ? ВОЙТИ' : "НЕТ АККАУНТА? РЕГИСТРАЦИЯ"}
           </button>
        </div>
      </div>
    </div>
  );
};