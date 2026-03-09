// No static Comlink import — loaded dynamically from URL provided by main thread
import type { DepixelizeOptions, DepixelizeResult } from '../types';
import type { DepixelizeModule } from '../core';
import { depixelizeCore } from '../core';
import createDepixelizeModule from '../../wasm/depixelize.browser.js';

let moduleInstance: DepixelizeModule | null = null;

async function getModule(): Promise<DepixelizeModule> {
  if (moduleInstance) return moduleInstance;
  moduleInstance = (await createDepixelizeModule()) as unknown as DepixelizeModule;
  return moduleInstance;
}

// Pre-warm the module
const moduleReady = getModule().catch((err) => {
  console.error('Failed to load WASM module:', err);
  throw err;
});

async function depixelize(
  rgbaPixels: Uint8Array,
  width: number,
  height: number,
  options?: Partial<DepixelizeOptions>,
): Promise<DepixelizeResult> {
  const mod = await moduleReady;
  return depixelizeCore(mod, rgbaPixels, width, height, options);
}

// Wait for Comlink URL from main thread, then expose the API
self.addEventListener('message', async function init(e: MessageEvent) {
  if (e.data?.__comlinkUrl__) {
    self.removeEventListener('message', init);
    const Comlink = await import(/* @vite-ignore */ e.data.__comlinkUrl__);
    Comlink.expose({ depixelize });
    self.postMessage({ __ready__: true });
  }
});
