
import React, { useState, useRef } from 'react';
import { GeminiLiveAssistant } from '../services/audioService';

export const VoiceAssistant: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [transcription, setTranscription] = useState<{text: string, isModel: boolean}[]>([]);
  const assistantRef = useRef<GeminiLiveAssistant | null>(null);

  const toggleAssistant = async () => {
    if (isActive) {
      assistantRef.current?.stop();
      setIsActive(false);
    } else {
      assistantRef.current = new GeminiLiveAssistant();
      await assistantRef.current.start((text, isModel) => {
        setTranscription(prev => [...prev.slice(-4), { text, isModel }]);
      });
      setIsActive(true);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-4">
      {isActive && (
        <div className="w-64 bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 p-4 flex flex-col gap-2 max-h-64 overflow-y-auto">
          {transcription.length === 0 && <p className="text-xs text-slate-400 italic">Listening...</p>}
          {transcription.map((t, i) => (
            <div key={i} className={`p-2 rounded-lg text-xs ${t.isModel ? 'bg-violet-50 text-violet-700 font-medium self-start' : 'bg-slate-100 text-slate-600 self-end'}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}
      
      <button 
        onClick={toggleAssistant}
        className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all ${
          isActive 
          ? 'bg-red-500 text-white animate-pulse' 
          : 'bg-[var(--primary)] text-white hover:scale-110 active:scale-90'
        }`}
      >
        {isActive ? (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>
    </div>
  );
};
