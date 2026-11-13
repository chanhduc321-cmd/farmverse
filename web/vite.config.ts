import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { SOCIAL_AUTH_API } from '../shared/social-auth.mts';

const port = Number(process.env.PORT ?? 5174);
const target = process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8092';
const proxy = {
  '/api': {
    target,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};

// The shared NEAR Auth testnet client accepts the root URL on localhost:3000.
// Forward OAuth responses at that URL while serving ordinary visits as the game.
if (port === 3000) {
  Object.assign(proxy, {
    '^/\\?(?=(?:[^&]*&)*state=)(?=(?:[^&]*&)*(?:code|error)=)': {
      target,
      changeOrigin: true,
      rewrite: (path: string) => `${SOCIAL_AUTH_API.near.callback}${path.slice(1)}`,
    },
  });
}

export default defineConfig({
  publicDir: fileURLToPath(new URL('../image', import.meta.url)),
  server: { host: '127.0.0.1', port, proxy },
  preview: { host: '127.0.0.1', port, proxy },
});
