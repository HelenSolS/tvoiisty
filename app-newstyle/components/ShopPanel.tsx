
import React, { useState } from 'react';
import { UserRole, Shop, Collection, CollectionItem } from '../types';
import { MOCK_SHOPS } from '../constants';

interface ShopPanelProps {
  isOpen: boolean;
  onClose: () => void;
  role: UserRole;
  onSelectItem: (item: CollectionItem) => void;
}

export const ShopPanel: React.FC<ShopPanelProps> = ({ isOpen, onClose, role, onSelectItem }) => {
  const [view, setView] = useState<'shops' | 'collections' | 'items' | 'manage'>('shops');
  const [currentShop, setCurrentShop] = useState<Shop | null>(null);
  const [currentCollection, setCurrentCollection] = useState<Collection | null>(null);
  const [localShops, setLocalShops] = useState<Shop[]>(MOCK_SHOPS);

  const isOwner = role === UserRole.SHOP_USER || role === UserRole.ADMIN;

  const handleAddCollection = () => {
    const name = prompt("Название новой коллекции 2026:");
    if (!name || !currentShop) return;
    
    const newCol: Collection = { id: Date.now().toString(), name, items: [] };
    setLocalShops(prev => prev.map(s => s.id === currentShop.id ? { ...s, collections: [...s.collections, newCol] } : s));
    alert("Коллекция создана.");
  };

  const handleAddItem = () => {
    const title = prompt("Название модели:");
    const imageUrl = prompt("URL изображения (прозрачный фон или на модели):");
    const buyUrl = prompt("Ссылка на страницу товара (магазин/маркетплейс):");
    if (!title || !imageUrl || !currentCollection) return;

    const newItem: CollectionItem = {
      id: Date.now().toString(),
      title,
      imageUrl,
      buyUrl: buyUrl || '#',
      shopName: currentShop?.name
    };

    setLocalShops(prev => prev.map(s => {
      if (s.id === currentShop?.id) {
        return {
          ...s,
          collections: s.collections.map(c => c.id === currentCollection.id ? { ...c, items: [newItem, ...c.items] } : c)
        };
      }
      return s;
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col transform animate-in slide-in-from-right duration-500 overflow-hidden">
        
        {/* Header */}
        <div className="px-8 pt-14 pb-6 flex items-center justify-between border-b border-slate-50">
          <div className="flex items-center gap-4">
            {view !== 'shops' && (
              <button 
                onClick={() => {
                  if (view === 'items') setView('collections');
                  else if (view === 'collections' || view === 'manage') setView('shops');
                }}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            <h2 className="text-3xl font-black tracking-tighter uppercase">
              {view === 'shops' ? 'Бутики' : view === 'collections' ? currentShop?.name : currentCollection?.name}
            </h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 no-scrollbar pb-40">
          
          {view === 'shops' && (
            <div className="space-y-6">
              {localShops.map(shop => (
                <div key={shop.id} className="relative group overflow-hidden rounded-[2.5rem] bg-slate-50 p-10 transition-all hover:bg-slate-900">
                  <div className="relative z-10 flex flex-col h-full justify-between">
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 group-hover:text-white transition-colors">{shop.name}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{shop.collections.length} Коллекций 2026</p>
                    </div>
                    <div className="flex gap-3 mt-8">
                      <button 
                        onClick={() => { setCurrentShop(shop); setView('collections'); }}
                        className="px-6 py-3 bg-white text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest"
                      >
                        Смотреть
                      </button>
                      {isOwner && (
                        <button 
                          onClick={() => { setCurrentShop(shop); setView('manage'); }}
                          className="px-6 py-3 bg-white/10 text-white rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/20"
                        >
                          Управлять
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="absolute -bottom-10 -right-10 text-9xl font-black text-black/5 group-hover:text-white/5 transition-colors select-none">26</div>
                </div>
              ))}
            </div>
          )}

          {view === 'collections' && currentShop && (
            <div className="grid grid-cols-1 gap-4">
              {currentShop.collections.map(col => (
                <button
                  key={col.id}
                  onClick={() => { setCurrentCollection(col); setView('items'); }}
                  className="p-8 bg-white border-2 border-slate-50 rounded-3xl flex items-center justify-between hover:border-slate-900 transition-all group"
                >
                  <div className="text-left">
                    <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{col.items.length} МОДЕЛЕЙ</p>
                    <h4 className="text-xl font-black uppercase tracking-tighter">{col.name}</h4>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </button>
              ))}
            </div>
          )}

          {view === 'items' && currentCollection && (
            <div className="grid grid-cols-2 gap-6">
              {currentCollection.items.map(item => (
                <div key={item.id} className="group animate-in fade-in zoom-in duration-500">
                  <div className="aspect-[3/4] rounded-[2rem] overflow-hidden bg-slate-50 relative border border-slate-50 shadow-sm">
                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                    <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-3 p-6 transition-opacity">
                      <button 
                        onClick={() => { onSelectItem(item); onClose(); }}
                        className="w-full py-3 bg-white text-slate-900 rounded-xl font-black text-[9px] uppercase tracking-widest"
                      >
                        Примерить
                      </button>
                      <a 
                        href={item.buyUrl} target="_blank" rel="noreferrer"
                        className="w-full py-3 border border-white/30 text-white rounded-xl font-black text-[9px] uppercase tracking-widest text-center"
                      >
                        Купить
                      </a>
                    </div>
                  </div>
                  <div className="mt-3 px-1">
                    <h5 className="text-[10px] font-black uppercase tracking-tight text-slate-900 leading-none">{item.title}</h5>
                    <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mt-1">{currentShop?.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === 'manage' && currentShop && (
            <div className="space-y-8">
              <div className="p-8 bg-slate-900 rounded-[2rem] text-white">
                <h4 className="text-xl font-black uppercase mb-2">Админ-панель магазина</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Здесь вы создаете свои витрины</p>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={handleAddCollection}
                  className="w-full py-5 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-3 text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  <span className="text-[10px] font-black uppercase tracking-widest">Создать коллекцию</span>
                </button>

                {currentShop.collections.map(col => (
                  <div key={col.id} className="p-6 bg-slate-50 rounded-2xl flex items-center justify-between">
                    <span className="font-black text-xs uppercase">{col.name}</span>
                    <button 
                      onClick={() => { setCurrentCollection(col); handleAddItem(); }}
                      className="px-4 py-2 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest"
                    >
                      + Добавить вещь
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
