import * as Comlink from 'comlink';
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

Comlink.expose({ depixelize });
