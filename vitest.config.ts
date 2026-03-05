import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { comlink } from 'vite-plugin-comlink';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [comlink(), wasm(), topLevelAwait()],
  worker: {
    plugins: () => [comlink(), wasm(), topLevelAwait()],
    format: 'es',
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
    browser: {
      provider: playwright(),
      enabled: true,
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
