import { defineConfig } from 'vite';
import { comlink } from 'vite-plugin-comlink';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [comlink(), wasm(), topLevelAwait(), dts({ tsconfigPath: './tsconfig.build.json' })],
  worker: {
    plugins: () => [comlink(), wasm(), topLevelAwait()],
    format: 'es',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    outDir: 'dist',
    rollupOptions: {
      external: ['comlink'],
    },
  },
});
