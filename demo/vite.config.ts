import { defineConfig } from 'vite';
import { comlink } from 'vite-plugin-comlink';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  plugins: [comlink(), wasm(), topLevelAwait()],
  worker: {
    plugins: () => [comlink(), wasm(), topLevelAwait()],
    format: 'es',
  },
  resolve: {
    alias: {
      'libdepixelize-wasm': resolve(__dirname, '../src/index.ts'),
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
