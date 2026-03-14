import React from 'react';

interface DropzoneProps {
  image?: string | null;
  onImageUpload: (base64: string) => void;
  placeholder: string;
}

export const Dropzone: React.FC<DropzoneProps> = ({ image = null, onImageUpload, placeholder }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageUpload(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="relative group w-full h-full">
      <label className="block w-full h-full bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 hover:border-[var(--primary)] transition-all cursor-pointer overflow-hidden relative group">
        <input 
          type="file" 
          className="hidden" 
          accept="image/*" 
          onChange={handleFileChange} 
        />
        
        {image ? (
          <img src={image} alt="Preview" className="w-full h-full object-contain rounded-[2rem] animate-in fade-in duration-500" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-300 group-hover:text-[var(--primary)] transition-colors">
            <div className="w-12 h-12 rounded-full border border-slate-200 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="font-bold text-[10px] uppercase tracking-widest leading-tight">{placeholder}</p>
          </div>
        )}

        {image && (
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[2px]">
            <span className="bg-white px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-xl">ИЗМЕНИТЬ</span>
          </div>
        )}
      </label>
    </div>
  );
};