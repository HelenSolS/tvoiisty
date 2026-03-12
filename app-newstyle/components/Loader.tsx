import React from 'react';

interface LoaderProps {
  t: any;
}

const Loader: React.FC<LoaderProps> = ({ t }) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
      <div className="w-12 h-12 border-4 border-slate-100 border-t-[var(--primary)] rounded-full animate-spin mb-6"></div>
      <h3 className="text-xl font-black tracking-tight">{t.resultPlaceholder}...</h3>
    </div>
  );
};

export default Loader;
