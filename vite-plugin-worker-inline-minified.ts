import type { Plugin, ResolvedConfig } from 'vite';
import { build } from 'esbuild';

const SUFFIX = '?worker-inline-minified';

export function workerInlineMinifiedPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'worker-inline-minified',
    enforce: 'pre',

    configResolved(resolved) {
      config = resolved;
    },

    async resolveId(source, importer) {
      if (!source.endsWith(SUFFIX)) return null;
      const rawPath = source.slice(0, -SUFFIX.length);
      const resolved = await this.resolve(rawPath, importer, { skipSelf: true });
      if (!resolved) return null;
      return resolved.id + SUFFIX;
    },

    async load(id) {
      if (!id.endsWith(SUFFIX)) return null;
      const filePath = id.slice(0, -SUFFIX.length);

      if (config.command === 'serve') {
        // Delegate to Vite's built-in ?worker handling in dev mode.
        // This ensures HMR client code is not injected into the worker module.
        return `export { default } from ${JSON.stringify(filePath + '?worker')};`;
      }

      const result = await build({
        entryPoints: [filePath],
        bundle: true,
        format: 'esm',
        write: false,
        platform: 'browser',
        target: 'esnext',
        minify: true,
        legalComments: 'none',
        treeShaking: true,
      });

      const workerCode = result.outputFiles[0].text;

      return [
        `const __workerCode = ${JSON.stringify(workerCode)};`,
        `const __workerBlob = new Blob([__workerCode], { type: "text/javascript;charset=utf-8" });`,
        `const __workerUrl = (window.URL || window.webkitURL).createObjectURL(__workerBlob);`,
        `export default class extends Worker {`,
        `  constructor(options) {`,
        `    super(__workerUrl, { ...options, type: "module" });`,
        `    setTimeout(() => (window.URL || window.webkitURL).revokeObjectURL(__workerUrl), 0);`,
        `  }`,
        `}`,
      ].join('\n');
    },
  };
}
