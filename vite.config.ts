import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type {ViteDevServer} from 'vite';
import {defineConfig, loadEnv} from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(__dirname, 'Demo');

/** Serve `Demo/index.html` + local GLBs at `/Demo/*` during dev (folder lives at repo root, outside `public/`). */
function demoFolderPlugin() {
  return {
    name: 'visiarise-demo-folder',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const u = req.url?.split('?')[0] ?? '';
        if (!u.startsWith('/Demo')) return next();
        const relRaw = u.slice('/Demo'.length).replace(/^\/+/, '') || 'index.html';
        let rel: string;
        try {
          rel = decodeURIComponent(relRaw);
        } catch {
          return next();
        }
        const candidate = path.resolve(demoRoot, rel);
        const demoResolved = path.resolve(demoRoot);
        const relToDemo = path.relative(demoResolved, candidate);
        if (relToDemo.startsWith('..') || path.isAbsolute(relToDemo)) return next();
        let stat: fs.Stats;
        try {
          stat = fs.statSync(candidate);
        } catch {
          return next();
        }
        if (!stat.isFile()) return next();
        const mime = candidate.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : candidate.endsWith('.glb')
            ? 'model/gltf-binary'
            : 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        fs.createReadStream(candidate).pipe(res);
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  /** Backend port: must match backend/.env PORT. Default 5000 often conflicts with macOS AirPlay → 403 AirTunes. */
  const apiTarget =
    env.VITE_DEV_API_ORIGIN || `http://127.0.0.1:${env.PORT || '5000'}`;
  return {
    plugins: [demoFolderPlugin(), react(), tailwindcss()],
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
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
