import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { DepixelizeOptions, DepixelizeResult } from './types.js';
import type { DepixelizeModule, ImageDataLike } from './core.js';
import { depixelizeCore } from './core.js';
import createDepixelizeModule from '../wasm/depixelize.js';

let modulePromise: Promise<DepixelizeModule> | null = null;

function getModule(): Promise<DepixelizeModule> {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const wasmPath = join(__dirname, '..', 'wasm', 'depixelize.wasm');
    const wasmBinary = await readFile(wasmPath);
    return (await createDepixelizeModule({
      wasmBinary,
    })) as unknown as DepixelizeModule;
  })();
  return modulePromise;
}

export async function depixelizeImage(
  imageData: ImageDataLike,
  options?: Partial<DepixelizeOptions>,
): Promise<DepixelizeResult> {
  const mod = await getModule();
  return depixelizeCore(mod, imageData.data, imageData.width, imageData.height, options);
}
