import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const proxy = {
  '/api': {
    target: process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8092',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  publicDir: fileURLToPath(new URL('../image', import.meta.url)),
  server: { host: '127.0.0.1', port: Number(process.env.PORT ?? 5174), proxy },
  preview: { host: '127.0.0.1', port: Number(process.env.PORT ?? 5174), proxy },
});
