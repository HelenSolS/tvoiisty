/**
 * Лаборатория (dev): тестирование примерки и видео по пулу моделей KIE.
 * Один клик → одна модель. Выбор модели из выпадающего списка.
 * В production UI скрыт (NODE_ENV / import.meta.env.DEV).
 */

import React, { useState, useEffect } from 'react';
import { ImageUploader } from './ImageUploader';
import { generateTryOn, generateVideo, IMAGE_MODEL_POOL, VIDEO_MODEL_POOL } from '../services/geminiService';
import type { LabTryOnExperiment, LabVideoExperiment } from '../types';

const LAB_STORAGE_KEY = 'tvoisty_lab_tryon';
const LAB_VIDEO_STORAGE_KEY = 'tvoisty_lab_video';

const MAX_IMAGE_PX = 1024;
const JPEG_QUALITY = 0.82;

/** Сжимает data URL: макс. сторона MAX_IMAGE_PX, JPEG. Уменьшает размер для KIE и снижает ошибки «internal error». */
function compressImageDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!dataUrl.startsWith('data:')) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > MAX_IMAGE_PX || h > MAX_IMAGE_PX) {
        if (w > h) {
          h = Math.round((h * MAX_IMAGE_PX) / w);
          w = MAX_IMAGE_PX;
        } else {
          w = Math.round((w * MAX_IMAGE_PX) / h);
          h = MAX_IMAGE_PX;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Ошибка загрузки изображения'));
    img.src = dataUrl;
  });
}

export const Lab: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [step, setStep] = useState<'tryon' | 'video'>('tryon');

  // Шаг 1 — Примерка
  const [personImage, setPersonImage] = useState<string | null>(null);
  const [outfitImage, setOutfitImage] = useState<string | null>(null);
  const [imageModel, setImageModel] = useState<string>(IMAGE_MODEL_POOL[0]);
  const [tryonLoading, setTryonLoading] = useState(false);
  const [tryonError, setTryonError] = useState<string | null>(null);
  const [tryonResult, setTryonResult] = useState<{ imageUrl: string; durationMs: number; model: string } | null>(null);
  const [savedTryons, setSavedTryons] = useState<LabTryOnExperiment[]>([]);

  // Шаг 2 — Видео
  const [videoSourceUrl, setVideoSourceUrl] = useState<string | null>(null);
  const [videoModel, setVideoModel] = useState<string>(VIDEO_MODEL_POOL[0]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<{ videoUrl: string; durationMs: number; model: string } | null>(null);
  const [savedVideos, setSavedVideos] = useState<LabVideoExperiment[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAB_STORAGE_KEY);
      if (raw) setSavedTryons(JSON.parse(raw));
      const rawV = localStorage.getItem(LAB_VIDEO_STORAGE_KEY);
      if (rawV) setSavedVideos(JSON.parse(rawV));
    } catch {}
  }, []);

  const saveTryons = (list: LabTryOnExperiment[]) => {
    setSavedTryons(list);
    try { localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(list)); } catch {}
  };

  const saveVideos = (list: LabVideoExperiment[]) => {
    setSavedVideos(list);
    try { localStorage.setItem(LAB_VIDEO_STORAGE_KEY, JSON.stringify(list)); } catch {}
  };

  const runTryOn = async () => {
    if (!personImage || !outfitImage) return;
    setTryonError(null);
    setTryonResult(null);
    setTryonLoading(true);
    const start = Date.now();
    try {
      const [personCompressed, outfitCompressed] = await Promise.all([
        compressImageDataUrl(personImage),
        compressImageDataUrl(outfitImage),
      ]);
      const imageUrl = await generateTryOn(personCompressed, outfitCompressed, undefined, { model: imageModel });
      const durationMs = Date.now() - start;
      setTryonResult({ imageUrl, durationMs, model: imageModel });
    } catch (e: unknown) {
      setTryonError(e instanceof Error ? e.message : 'Ошибка примерки');
    } finally {
      setTryonLoading(false);
    }
  };

  const saveExperiment = () => {
    if (!tryonResult || !personImage || !outfitImage) return;
    const item: LabTryOnExperiment = {
      id: `lab_${Date.now()}`,
      personUrl: personImage,
      outfitUrl: outfitImage,
      resultUrl: tryonResult.imageUrl,
      provider: tryonResult.model,
      durationMs: tryonResult.durationMs,
      timestamp: Date.now(),
    };
    saveTryons([item, ...savedTryons].slice(0, 30));
  };

  const loadExperimentIntoSlots = (exp: LabTryOnExperiment) => {
    setPersonImage(exp.personUrl);
    setOutfitImage(exp.outfitUrl);
    setTryonResult(null);
    setTryonError(null);
  };

  const runVideo = async () => {
    const source = videoSourceUrl || tryonResult?.imageUrl;
    if (!source) return;
    setVideoError(null);
    setVideoResult(null);
    setVideoLoading(true);
    const start = Date.now();
    try {
      const videoUrl = await generateVideo(source, { model: videoModel });
      const durationMs = Date.now() - start;
      setVideoResult({ videoUrl, durationMs, model: videoModel });
      saveVideos([{ id: `v_${Date.now()}`, sourceImageUrl: source, videoUrl, provider: videoModel, durationMs, timestamp: Date.now() }, ...savedVideos].slice(0, 20));
    } catch (e: unknown) {
      setVideoError(e instanceof Error ? e.message : 'Ошибка создания видео');
    } finally {
      setVideoLoading(false);
    }
  };

  const allResultImages = [tryonResult?.imageUrl, ...savedTryons.map(t => t.resultUrl)].filter(Boolean) as string[];

  return (
    <div className="p-6 pb-28 space-y-10 animate-in fade-in">
      <div className="flex items-center justify-between">
        <h2 className="serif text-2xl font-black italic">Лаборатория</h2>
        <button onClick={onBack} className="text-gray-400 text-[10px] font-black uppercase tracking-widest">← Назад</button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setStep('tryon')} className={`py-2.5 px-4 rounded-full text-[10px] font-black uppercase tracking-widest ${step === 'tryon' ? 'bg-theme text-white' : 'bg-white text-gray-400 border'}`}>Шаг 1: Примерка</button>
        <button onClick={() => setStep('video')} className={`py-2.5 px-4 rounded-full text-[10px] font-black uppercase tracking-widest ${step === 'video' ? 'bg-theme text-white' : 'bg-white text-gray-400 border'}`}>Шаг 2: Видео</button>
      </div>

      {step === 'tryon' && (
        <>
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Человек + образ</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="aspect-[9/16] rounded-2xl overflow-hidden border-2 border-white shadow-xl">
                <ImageUploader label="Человек" image={personImage} onImageSelect={setPersonImage} icon={<span className="text-2xl">👤</span>} />
              </div>
              <div className="aspect-[9/16] rounded-2xl overflow-hidden border-2 border-white shadow-xl">
                <ImageUploader label="Образ" image={outfitImage} onImageSelect={setOutfitImage} icon={<span className="text-2xl">👗</span>} />
              </div>
            </div>
          </section>

          <section>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Модель (image)</p>
            <select value={imageModel} onChange={e => setImageModel(e.target.value)} className="w-full py-2.5 px-4 rounded-xl border-2 border-white bg-white text-gray-800 text-[11px] font-bold uppercase tracking-wide">
              {IMAGE_MODEL_POOL.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </section>

          <button onClick={runTryOn} disabled={tryonLoading || !personImage || !outfitImage} className="w-full py-4 bg-theme text-white rounded-2xl font-black text-[11px] uppercase tracking-widest disabled:opacity-50">
            {tryonLoading ? `Отправка в ${imageModel}...` : 'Generate Image'}
          </button>

          {tryonError && <p className="text-red-500 text-[10px] font-bold">{tryonError}</p>}

          {tryonResult && (
            <section className="space-y-2">
              <p className="text-[9px] font-black uppercase text-gray-500">Результат · {tryonResult.model} · {(tryonResult.durationMs / 1000).toFixed(1)} сек</p>
              <div className="rounded-2xl overflow-hidden border-2 border-white shadow-xl aspect-[9/16]">
                <img src={tryonResult.imageUrl} alt="Результат" className="w-full h-full object-cover" />
              </div>
              <button onClick={saveExperiment} className="w-full py-2.5 bg-white border border-theme text-theme rounded-xl text-[10px] font-black uppercase tracking-widest">Сохранить эксперимент</button>
            </section>
          )}

          {savedTryons.length > 0 && (
            <section>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Сохранённые эксперименты</h3>
              <div className="grid grid-cols-3 gap-2">
                {savedTryons.slice(0, 9).map(exp => (
                  <button key={exp.id} onClick={() => loadExperimentIntoSlots(exp)} className="rounded-xl overflow-hidden border border-white shadow-lg aspect-[9/16] block">
                    <img src={exp.resultUrl} className="w-full h-full object-cover" alt="" />
                    <span className="block text-[8px] font-bold text-gray-500 truncate px-1">{(exp.durationMs / 1000).toFixed(1)}s · {exp.provider}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {step === 'video' && (
        <>
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Источник картинки для видео</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {allResultImages.slice(0, 6).map((url, i) => (
                <button key={i} onClick={() => setVideoSourceUrl(url)} className={`rounded-xl overflow-hidden border-2 aspect-[9/16] ${videoSourceUrl === url ? 'border-theme ring-2 ring-theme' : 'border-white'}`}>
                  <img src={url} className="w-full h-full object-cover" alt="" />
                </button>
              ))}
            </div>
            <div className="aspect-[9/16] max-h-48 rounded-2xl overflow-hidden border-2 border-white shadow-xl">
              <ImageUploader label="Или загрузить новую" image={videoSourceUrl && !allResultImages.includes(videoSourceUrl) ? videoSourceUrl : null} onImageSelect={setVideoSourceUrl} icon={<span className="text-xl">🖼</span>} />
            </div>
          </section>

          <section>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Модель (video)</p>
            <select value={videoModel} onChange={e => setVideoModel(e.target.value)} className="w-full py-2.5 px-4 rounded-xl border-2 border-white bg-white text-gray-800 text-[11px] font-bold uppercase tracking-wide">
              {VIDEO_MODEL_POOL.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </section>

          <button onClick={runVideo} disabled={videoLoading || !(videoSourceUrl || tryonResult?.imageUrl)} className="w-full py-4 bg-theme text-white rounded-2xl font-black text-[11px] uppercase tracking-widest disabled:opacity-50">
            {videoLoading ? `Отправка в ${videoModel}...` : 'Generate Video'}
          </button>

          {videoError && <p className="text-red-500 text-[10px] font-bold">{videoError}</p>}

          {videoResult && (
            <section className="space-y-2">
              <p className="text-[9px] font-black uppercase text-gray-500">Результат · {videoResult.model} · {(videoResult.durationMs / 1000).toFixed(1)} сек</p>
              <div className="rounded-2xl overflow-hidden border-2 border-white shadow-xl aspect-[9/16] max-h-[50vh] bg-black">
                <video src={videoResult.videoUrl} controls className="w-full h-full object-contain" playsInline />
              </div>
            </section>
          )}

          {savedVideos.length > 0 && (
            <section>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Последние видео</h3>
              <div className="grid grid-cols-2 gap-2">
                {savedVideos.slice(0, 4).map(v => (
                  <div key={v.id} className="rounded-xl overflow-hidden border border-white shadow-lg aspect-[9/16] bg-black">
                    <video src={v.videoUrl} className="w-full h-full object-contain" playsInline muted />
                    <span className="block text-[8px] font-bold text-gray-500 px-1">{(v.durationMs / 1000).toFixed(1)}s · {v.provider}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
