import type { DepixelizeOptions, DepixelizeResult } from './types.js';
import { DEFAULT_OPTIONS } from './types.js';

export interface DepixelizeModule {
  depixelize(
    pixelsPtr: number,
    width: number,
    height: number,
    nChannels: number,
    curvesMultiplier: number,
    islandsWeight: number,
    sparsePixelsMultiplier: number,
    sparsePixelsRadius: number,
    optimize: boolean,
    method: number,
  ): string;
  wasmMalloc(size: number): number;
  wasmFree(ptr: number): void;
  HEAPU8: Uint8Array;
}

export interface ImageDataLike {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export const METHOD_MAP: Record<DepixelizeOptions['method'], number> = {
  splines: 0,
  voronoi: 1,
  grouped_voronoi: 2,
};

export function depixelizeCore(
  mod: DepixelizeModule,
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options?: Partial<DepixelizeOptions>,
): DepixelizeResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const nChannels = 4;
  const dataSize = pixels.byteLength;

  const ptr = mod.wasmMalloc(dataSize);
  if (ptr === 0) {
    throw new Error('Failed to allocate WASM memory');
  }

  try {
    mod.HEAPU8.set(pixels, ptr);

    const start = performance.now();
    const svg = mod.depixelize(
      ptr,
      width,
      height,
      nChannels,
      opts.curvesMultiplier,
      opts.islandsWeight,
      opts.sparsePixelsMultiplier,
      opts.sparsePixelsRadius,
      opts.optimize,
      METHOD_MAP[opts.method],
    );
    const processingTimeMs = performance.now() - start;

    return { svg, width, height, processingTimeMs };
  } finally {
    mod.wasmFree(ptr);
  }
}
