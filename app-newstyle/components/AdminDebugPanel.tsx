import React, { useState } from 'react';

interface AdminDebugPanelProps {
  logs: string[];
  onClose: () => void;
}

export const AdminDebugPanel: React.FC<AdminDebugPanelProps> = ({ logs, onClose }) => {
  const [password, setPassword] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '888') {
      setAuthorized(true);
      setError(null);
    } else {
      setError('Неверный пароль');
    }
  };

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-red-200">
          <h2 className="text-2xl font-black tracking-tighter mb-4 text-red-500 uppercase">!тест админ</h2>
          <p className="text-xs text-slate-500 font-medium mb-6">
            Временная техническая страница для отладки. Не показывать пользователям.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                placeholder="Введите 888"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-between items-center pt-2">
              <button
                type="submit"
                className="px-6 py-2 bg-red-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-md"
              >
                Войти
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-[10px] font-bold text-slate-400 uppercase tracking-widest"
              >
                Назад
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[70vh] px-4 md:px-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black tracking-tighter text-red-500 uppercase">Логи ИИ / сети</h2>
        <button
          onClick={onClose}
          className="text-[10px] font-bold text-slate-400 uppercase tracking-widest"
        >
          Закрыть
        </button>
      </div>
      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-4">
        Только для внутренней диагностики. Копируй текст ошибок и присылай ассистенту.
      </p>
      <div className="flex-1 bg-slate-50 rounded-2xl p-4 overflow-auto border border-slate-100">
        {logs.length === 0 ? (
          <p className="text-xs text-slate-400">Пока нет ошибок в этой сессии.</p>
        ) : (
          <ul className="space-y-3 text-[11px] font-mono text-slate-700">
            {logs.map((line, idx) => (
              <li
                key={idx}
                className="whitespace-pre-wrap bg-white rounded-xl px-3 py-2 shadow-sm border border-slate-200"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Ошибка #{logs.length - idx}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(line);
                        setCopiedIndex(idx);
                        setTimeout(() => setCopiedIndex(null), 1500);
                      } catch {
                        // ignore clipboard errors
                      }
                    }}
                    className="text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800"
                  >
                    {copiedIndex === idx ? 'Скопировано' : 'Копировать'}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap break-words leading-snug">
                  {line}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

