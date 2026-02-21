import React, { useRef } from 'react';
import { compressImageForTryOn } from '../utils/imageCompression';

interface ImageUploaderProps {
  label: string;
  image: string | null;
  onImageSelect: (base64: string) => void;
  icon: React.ReactNode;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ label, image, onImageSelect, icon }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const compressed = await compressImageForTryOn(file);
      onImageSelect(compressed);
    } catch {
      const reader = new FileReader();
      reader.onloadend = () => onImageSelect(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div 
      className={`relative h-full w-full rounded-[2.8rem] overflow-hidden transition-all duration-700 flex items-center justify-center border-[6px] border-white shadow-2xl
        ${image ? 'bg-white' : 'bg-white/60 hover:bg-white/95 cursor-pointer active:scale-95 group'}`}
      onClick={() => fileInputRef.current?.click()}
    >
      <input type="file" className="hidden" ref={fileInputRef} accept="image/*" onChange={handleFileChange} />
      
      {image ? (
        <div className="w-full h-full relative group">
          <img src={image} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-theme/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-md">
             <span className="text-white text-[11px] font-black uppercase tracking-[0.3em] border-b-4 border-white pb-2">Заменить</span>
          </div>
        </div>
      ) : (
        <div className="text-center p-6 space-y-4">
          <div className="flex justify-center transition-transform group-hover:scale-110 duration-700">{icon}</div>
          <div className="space-y-1">
            <h3 className="text-[11px] font-black text-gray-800 uppercase tracking-widest leading-tight italic">{label}</h3>
          </div>
        </div>
      )}
    </div>
  );
};
