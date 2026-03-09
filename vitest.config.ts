import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'path';
import { copyExternalDeps } from './demo/vite-plugins';

export default defineConfig({
  plugins: [
    copyExternalDeps([
      { src: resolve(__dirname, 'node_modules/comlink/dist/esm/comlink.mjs'), dest: 'comlink.js' },
    ]),
  ],
  worker: {
    format: 'es',
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
    browser: {
      provider: playwright(),
      enabled: true,
      testerHtmlPath: resolve(__dirname, 'test/tester.html'),
      headless: true,
      screenshotFailures: false,
      instances: [
        {
          browser: 'chromium',
          launch: {
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
              '--use-gl=swiftshader',
              '--disable-software-rasterizer',
              '--in-process-gpu',
              '--disable-background-networking',
              '--disable-background-timer-throttling',
              '--disable-backgrounding-occluded-windows',
              '--disable-renderer-backgrounding',
              '--disable-ipc-flooding-protection',
              '--no-first-run',
              '--disable-extensions',
              '--disable-component-update',
              '--disable-hang-monitor',
            ],
          },
        },
      ],
    },
  },
});
