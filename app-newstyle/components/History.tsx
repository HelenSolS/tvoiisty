import React from 'react';

interface HistoryProps {
  items: string[];
  t: any;
}

export const History: React.FC<HistoryProps> = ({ items, t }) => {
  return (
    <div className="px-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="flex items-center justify-between mb-10">
        <h2 className="text-3xl font-black tracking-tighter">{t.history}</h2>
      </div>
      
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-300">
          <span className="text-5xl mb-6">📸</span>
          <p className="text-sm font-bold uppercase tracking-widest">История пуста</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map((img, i) => (
            <div 
              key={i} 
              className="group relative aspect-[3/4] bg-white rounded-[2.5rem] overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer flex items-center justify-center"
            >
              <img src={img} alt={`History ${i}`} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                <div className="flex gap-2">
                  <button className="flex-1 py-3 bg-white text-slate-900 rounded-xl font-bold text-[10px] uppercase tracking-widest">{t.download}</button>
                  <button className="flex-1 py-3 bg-black/40 backdrop-blur-md text-white border border-white/20 rounded-xl font-bold text-[10px] uppercase tracking-widest">{t.share}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
