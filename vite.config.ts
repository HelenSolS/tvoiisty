import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения из системы (Vercel передает их сюда)
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    server: {
      proxy: { '/api': 'http://localhost:4000' },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // KIE_API_KEY не прокидываем на фронт — используется только в /api/* (backend)
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: './index.html',
        },
      },
    },
  };
});