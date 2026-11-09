import { defineConfig } from 'vite';

const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8080';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
