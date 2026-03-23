import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      dedupe: ['three'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) return 'three';
            if (id.includes('node_modules/@react-three')) return 'r3f';
            if (id.includes('node_modules/firebase')) return 'firebase';
            if (id.includes('node_modules/gsap')) return 'gsap';
          },
        },
      },
    },
    server: {
      // Fixed port so VisiARise never shares 3000 with other apps (e.g. Hoppscotch).
      // If you still see :3000, your shell may have PORT=3000 — unset PORT or use this URL.
      port: 5173,
      // If 5173 is taken (another Vite tab), use the next free port instead of failing.
      strictPort: false,
      host: true,
      watch: {
        ignored: [path.resolve(__dirname, 'backend/**')],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_ORIGIN || 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
      },
    },
  };
});
