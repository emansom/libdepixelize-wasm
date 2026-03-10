import { defineConfig } from 'vite';
import { compression, defineAlgorithm } from 'vite-plugin-compression2';
import zlib from 'node:zlib';
import { resolve } from 'path';
import { htmlMinifyPlugin, copyExternalDeps } from './vite-plugins';
import { workerInlineMinifiedPlugin } from '../vite-plugin-worker-inline-minified';

export default defineConfig({
  root: resolve(__dirname),
  plugins: [
    workerInlineMinifiedPlugin(),
    htmlMinifyPlugin(),
    copyExternalDeps([
      { src: resolve(__dirname, '../node_modules/comlink/dist/esm/comlink.mjs'), dest: 'comlink.js' },
    ]),
    compression({
      algorithms: [
        defineAlgorithm('gzip', {
          level: zlib.constants.Z_BEST_COMPRESSION,
          memLevel: 9,
        }),
        defineAlgorithm('brotliCompress', {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
            [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
            [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
          },
        }),
        defineAlgorithm('zstd', {
          params: {
            [zlib.constants.ZSTD_c_compressionLevel]: 22,
            [zlib.constants.ZSTD_c_strategy]: zlib.constants.ZSTD_btultra2,
          },
        }),
      ],
      threshold: 512,
    }),
  ],
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      'libdepixelize-wasm': resolve(__dirname, '../src/index.ts'),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      external: ['comlink'],
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
      output: {
        compact: true,
        minifyInternalExports: true,
        generatedCode: {
          arrowFunctions: true,
          constBindings: true,
          objectShorthand: true,
        },
      },
    },
    esbuild: {
      minifyIdentifiers: true,
      minifyWhitespace: true,
      minifySyntax: true,
      treeShaking: true,
      legalComments: 'none',
      drop: ['console'],
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
