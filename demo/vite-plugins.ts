import type { Plugin } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import zlib from 'node:zlib';
import { transform } from 'esbuild';
import minifyHtml from '@minify-html/node';

// htmlMinifyPlugin — minifies HTML, CSS, inline JS, and importmap JSON.
// @minify-html/node handles CSS/JS/HTML but not importmap JSON —
// post-process with JSON.parse + JSON.stringify to strip whitespace.
export function htmlMinifyPlugin(): Plugin {
  return {
    name: 'html-minify',
    transformIndexHtml(html) {
      const minified = minifyHtml
        .minify(Buffer.from(html), {
          minify_css: true,
          minify_js: true,
        })
        .toString();
      return minified.replace(
        /(<script type=importmap>)([\s\S]*?)(<\/script>)/i,
        (_, open, json, close) => `${open}${JSON.stringify(JSON.parse(json))}${close}`,
      );
    },
  };
}

// copyExternalDeps — minifies + pre-compresses externalized ESM deps into dist/libs/.
// In dev/test mode, serves source files from node_modules at /libs/{dest}.
// Reusable: pass { src, dest }[] to add any number of external deps.
export interface ExternalDep {
  /** Absolute path to the source ESM file in node_modules */
  src: string;
  /** Output filename in dist/libs/ (e.g. 'comlink.js') */
  dest: string;
}

export function copyExternalDeps(deps: ExternalDep[]): Plugin {
  return {
    name: 'copy-external-deps',
    configureServer(server) {
      const pathMap = new Map(deps.map((d) => [`/libs/${d.dest}`, d.src]));
      server.middlewares.use((req, res, next) => {
        const src = pathMap.get(req.url!);
        if (src) {
          res.setHeader('Content-Type', 'application/javascript');
          res.end(readFileSync(src, 'utf-8'));
        } else {
          next();
        }
      });
    },
    async writeBundle(options) {
      const outDir = options.dir!;
      const libsDir = resolve(outDir, 'libs');
      await mkdir(libsDir, { recursive: true });

      for (const dep of deps) {
        const code = readFileSync(dep.src, 'utf-8');
        const result = await transform(code, {
          minifyWhitespace: true,
          minifySyntax: true,
          minifyIdentifiers: true,
          target: 'esnext',
          format: 'esm',
          legalComments: 'none',
        });
        const destPath = resolve(libsDir, dep.dest);
        const buf = Buffer.from(result.code);
        await writeFile(destPath, buf);

        await Promise.all([
          writeFile(
            `${destPath}.gz`,
            zlib.gzipSync(buf, {
              level: zlib.constants.Z_BEST_COMPRESSION,
              memLevel: 9,
            }),
          ),
          writeFile(
            `${destPath}.br`,
            zlib.brotliCompressSync(buf, {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
                [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
                [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
              },
            }),
          ),
          writeFile(
            `${destPath}.zst`,
            zlib.zstdCompressSync(buf, {
              params: {
                [zlib.constants.ZSTD_c_compressionLevel]: 22,
                [zlib.constants.ZSTD_c_strategy]: zlib.constants.ZSTD_btultra2,
              },
            }),
          ),
        ]);
      }
    },
  };
}
