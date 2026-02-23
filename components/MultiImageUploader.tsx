/**
 * Загрузка до 10 изображений за раз. Превью, валидация. Issue #21.
 */

import React, { useRef } from 'react';

const MAX_IMAGES = 10;
const ACCEPT = 'image/*';

export interface MultiImageUploaderProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  label?: string;
  maxCount?: number;
}

export const MultiImageUploader: React.FC<MultiImageUploaderProps> = ({
  images,
  onImagesChange,
  label = 'До 10 фото',
  maxCount = MAX_IMAGES,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const base = [...images];
    const remaining = maxCount - base.length;
    if (remaining <= 0) return;
    const toRead = files.filter(f => f.type.startsWith('image/')).slice(0, remaining);
    const results: string[] = [];
    let done = 0;
    toRead.forEach((file, i) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        results[i] = reader.result as string;
        done++;
        if (done === toRead.length) {
          const ordered = results.filter(Boolean);
          onImagesChange([...base, ...ordered].slice(0, maxCount));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAt = (index: number) => {
    const next = images.filter((_, i) => i !== index);
    onImagesChange(next);
  };

  const canAdd = images.length < maxCount;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">{label}</span>
        <span className="text-[9px] text-gray-400">{images.length} / {maxCount}</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {images.map((src, i) => (
          <div key={i} className="relative aspect-square rounded-xl overflow-hidden border-2 border-white shadow-lg group">
            <img src={src} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center text-[12px] font-black leading-none"
              aria-label="Удалить"
            >
              ×
            </button>
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 hover:border-theme hover:text-theme transition-colors"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/>
            </svg>
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};
