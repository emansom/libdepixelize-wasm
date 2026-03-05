import { defineConfig, type Plugin } from 'vite';
import { comlink } from 'vite-plugin-comlink';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { compression, defineAlgorithm } from 'vite-plugin-compression2';
import zlib from 'node:zlib';
import minifyHtml from '@minify-html/node';
import { resolve } from 'path';

function htmlMinifyPlugin(): Plugin {
  return {
    name: 'html-minify',
    transformIndexHtml(html) {
      return minifyHtml
        .minify(Buffer.from(html), {
          minify_css: true,
          minify_js: true,
        })
        .toString();
    },
  };
}

export default defineConfig({
  root: resolve(__dirname),
  plugins: [
    comlink(),
    wasm(),
    topLevelAwait(),
    htmlMinifyPlugin(),
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
    plugins: () => [comlink(), wasm(), topLevelAwait()],
    format: 'es',
  },
  resolve: {
    alias: {
      'libdepixelize-wasm': resolve(__dirname, '../src/index.ts'),
    },
  },
  build: {
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
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
