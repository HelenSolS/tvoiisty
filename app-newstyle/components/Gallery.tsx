import React from 'react';
import { MOCK_SHOPS } from '../constants';

interface GalleryProps {
  onSelect: (imageUrl: string) => void;
  t: any;
}

export const Gallery: React.FC<GalleryProps> = ({ onSelect, t }) => {
  const allItems = MOCK_SHOPS.flatMap(shop => 
    shop.collections.flatMap(col => 
      col.items.map(item => ({ ...item, shopLogo: shop.logo, shopName: shop.name }))
    )
  );

  return (
    <div className="px-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="flex items-center justify-between mb-10">
        <h2 className="text-3xl font-black tracking-tighter">{t.gallery}</h2>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {allItems.map((item) => (
          <div 
            key={item.id} 
            className="group relative aspect-[3/4] bg-white rounded-[2.5rem] overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer"
            onClick={() => onSelect(item.imageUrl)}
          >
            <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
              <h3 className="text-white font-bold text-sm mb-1">{item.title}</h3>
              <p className="text-white/60 text-[10px] uppercase tracking-widest font-bold">{item.shopName}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
