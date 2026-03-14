import React from 'react';

interface FullscreenPreviewProps {
  image: string | null;
  video?: string | null;
  onClose: () => void;
}

export const FullscreenPreview: React.FC<FullscreenPreviewProps> = ({ image, video = null, onClose }) => {
  const hasImage = !!image;
  const hasVideo = !!video;
  if (!hasImage && !hasVideo) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[var(--bg-main)]/95 backdrop-blur-xl animate-in fade-in duration-300 p-6">
      <button 
        onClick={onClose}
        className="absolute top-8 right-8 w-12 h-12 flex items-center justify-center bg-white shadow-xl rounded-full text-slate-900 transition-all z-10 hover:scale-110 active:scale-90"
      >
        <span className="text-2xl">✕</span>
      </button>
      
      <div className="relative w-full h-full flex items-center justify-center">
        <div className="relative max-w-full max-h-full p-2 bg-white rounded-[3rem] shadow-2xl animate-in zoom-in duration-500 overflow-hidden">
          {hasVideo ? (
            <video
              src={video || undefined}
              controls
              autoPlay
              loop
              className="max-w-full max-h-[80vh] object-contain rounded-[2.5rem]"
            />
          ) : (
            <img
              src={image || undefined}
              alt="Fullscreen Preview"
              className="max-w-full max-h-[80vh] object-contain rounded-[2.5rem]"
            />
          )}
        </div>
      </div>
    </div>
  );
};
