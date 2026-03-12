import React, { useState, useRef } from 'react';
import { Dropzone } from './Dropzone';
import Loader from './Loader';
import { startTryOn, uploadImage, getTryonStatus } from '../services/tryonService';
import { API_URL } from '../src/api/client';

interface QuickTryOnLiteProps {
  t: any;
}

const API_BASE = API_URL;

export const QuickTryOnLite: React.FC<QuickTryOnLiteProps> = ({ t }) => {
  const [personImage, setPersonImage] = useState<string | null>(null);
  const [garmentImage, setGarmentImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);

  const uploadToBackend = async (img: string, type: 'person' | 'clothing'): Promise<{ id: string; url: string } | null> => {
    try {
      let blob: Blob;
      if (!img) return null;
      if (img.startsWith('http://') || img.startsWith('https://')) {
        const r = await fetch(img, { mode: 'cors' });
        if (!r.ok) throw new Error(`fetch image ${r.status}`);
        blob = await r.blob();
      } else if (img.startsWith('data:')) {
        const base64 = img.includes(',') ? img.split(',')[1] : '';
        if (!base64) return null;
        const bin = atob(base64.replace(/\s/g, ''));
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        blob = new Blob([arr], { type: img.match(/data:([^;]+)/)?.[1] || 'image/png' });
      } else {
        return null;
      }

      const formData = new FormData();
      formData.append('file', blob, `${type}.png`);
      formData.append('type', type === 'person' ? 'person' : 'clothing');

      const res = await uploadImage({ apiBase: API_BASE, headers: {}, formData });
      const data = await res.json();
      const id = (data?.assetId ?? data?.id) ? String(data.assetId ?? data.id) : null;
      const url = data?.url ? String(data.url) : '';
      if (!id || !url) return null;
      return { id, url };
    } catch {
      return null;
    }
  };

  const handleTryOn = async () => {
    if (!personImage || !garmentImage) {
      setError('Загрузите фото человека и одежды.');
      return;
    }
    setError(null);
    setIsProcessing(true);
    setResultImage(null);

    try {
      const person = await uploadToBackend(personImage, 'person');
      const clothing = await uploadToBackend(garmentImage, 'clothing');
      if (!person || !clothing) {
        throw new Error('upload-failed');
      }

      const body = {
        person_asset_id: person.id,
        clothing_image_url: clothing.url,
      };

      const data = await startTryOn({
        apiBase: API_BASE,
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const sessionId = String(data.tryon_id ?? data.sessionId ?? 'mock');
      sessionRef.current = sessionId;

      const maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!sessionRef.current) return;
        const statusData = await getTryonStatus({
          apiBase: API_BASE,
          sessionId,
          headers: {},
          signal: new AbortController().signal,
        });
        const imageUrl = statusData.image_url ?? statusData.imageUrl;
        if (statusData.status === 'completed' && imageUrl) {
          setResultImage(imageUrl);
          return;
        }
        if (statusData.status === 'failed') {
          throw new Error('tryon-failed');
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error('tryon-timeout');
    } catch {
      setError('Не удалось выполнить примерку. Попробуйте ещё раз.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 py-10">
      <div className="text-center mb-10">
        <h1 className="text-4xl sm:text-5xl font-light tracking-tight mb-4 text-slate-900">
          Виртуальная примерка
        </h1>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Загрузите своё фото и фото одежды — и посмотрите, как работает наша технология.
        </p>
      </div>

      <div className="w-full max-w-5xl bg-white rounded-[3rem] p-8 sm:p-10 shadow-2xl border border-slate-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-3">
              ФОТО ЧЕЛОВЕКА
            </p>
            <div className="aspect-[3/4] w-full rounded-[2.5rem] overflow-hidden bg-slate-50">
              <Dropzone
                image={personImage || undefined}
                onImageUpload={setPersonImage}
                placeholder="Загрузите фото человека"
              />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-3">
              ОДЕЖДА
            </p>
            <div className="aspect-[3/4] w-full rounded-[2.5rem] overflow-hidden bg-slate-50">
              <Dropzone
                image={garmentImage || undefined}
                onImageUpload={setGarmentImage}
                placeholder="Загрузите фото одежды"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-center mb-8">
          <button
            onClick={handleTryOn}
            disabled={isProcessing || !personImage || !garmentImage}
            className="px-10 py-4 bg-slate-900 text-white rounded-full font-black text-[10px] uppercase tracking-[0.3em] disabled:opacity-40 disabled:cursor-not-allowed shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all active:scale-95"
          >
            Примерить
          </button>
        </div>

        <div className="mt-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-3">
            РЕЗУЛЬТАТ ПРИМЕРКИ
          </p>
          <div className="relative w-full bg-slate-50 rounded-[2.5rem] aspect-[16/9] overflow-hidden flex items-center justify-center">
            {isProcessing && <Loader t={t} />}
            {!isProcessing && resultImage && (
              <img
                src={resultImage}
                alt="Результат примерки"
                className="w-full h-full object-contain"
              />
            )}
            {!isProcessing && !resultImage && !error && (
              <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.25em]">
                Результат появится здесь
              </p>
            )}
            {!isProcessing && error && (
              <p className="text-xs text-rose-500 font-bold uppercase tracking-[0.25em] px-4 text-center">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickTryOnLite;

