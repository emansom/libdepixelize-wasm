import type { DepixelizeOptions, DepixelizeResult, BatchOptions, DepixelizeBatchResult } from './types.js';
import type { ImageDataLike } from './core.js';

export type ProcessFn = (
  pixels: Uint8Array,
  width: number,
  height: number,
  options?: Partial<DepixelizeOptions>,
) => Promise<DepixelizeResult>;

interface PoolEntry {
  fn: ProcessFn;
  busy: boolean;
}

interface Waiter {
  resolve: (fn: ProcessFn) => void;
}

export class WorkerPool {
  private factory: () => Promise<ProcessFn>;
  private maxSize: number;
  private entries: PoolEntry[] = [];
  private waiters: Waiter[] = [];
  private destroyed = false;
  private destroyFn?: (fn: ProcessFn) => Promise<void>;

  constructor(
    factory: () => Promise<ProcessFn>,
    maxSize: number,
    destroyFn?: (fn: ProcessFn) => Promise<void>,
  ) {
    this.factory = factory;
    this.maxSize = maxSize;
    this.destroyFn = destroyFn;
  }

  async acquire(): Promise<ProcessFn> {
    if (this.destroyed) throw new Error('Pool is destroyed');

    // Try to find an idle entry
    const idle = this.entries.find((e) => !e.busy);
    if (idle) {
      idle.busy = true;
      return idle.fn;
    }

    // Create a new entry if under capacity
    if (this.entries.length < this.maxSize) {
      const fn = await this.factory();
      const entry: PoolEntry = { fn, busy: true };
      this.entries.push(entry);
      return fn;
    }

    // Wait for one to become available
    return new Promise<ProcessFn>((resolve) => {
      this.waiters.push({ resolve });
    });
  }

  release(fn: ProcessFn): void {
    const entry = this.entries.find((e) => e.fn === fn);
    if (!entry) return;

    // Hand off to next waiter if any
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.resolve(fn);
      return;
    }

    entry.busy = false;
  }

  resize(n: number): void {
    this.maxSize = n;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    // Reject pending waiters
    for (const waiter of this.waiters) {
      // These will never resolve — callers should handle pool destruction
    }
    this.waiters.length = 0;

    if (this.destroyFn) {
      await Promise.all(this.entries.map((e) => this.destroyFn!(e.fn)));
    }
    this.entries.length = 0;
  }
}

const WASM_BASE_MB = 16;
const OVERHEAD_FACTOR = 10;
const STARTUP_MS = 100;
const MS_PER_PIXEL = 0.003;

export function calculateConcurrency(
  items: ImageDataLike[],
  maxConcurrency: number,
  maxMemoryMB: number,
): number {
  if (items.length === 0) return 1;

  const maxImagePixels = Math.max(...items.map((item) => item.width * item.height));
  const peakMB = (maxImagePixels * 4 * OVERHEAD_FACTOR) / (1024 * 1024);
  const memoryPerWorker = WASM_BASE_MB + peakMB;
  const memoryLimit = Math.floor(maxMemoryMB / memoryPerWorker);

  const totalPixels = items.reduce((sum, item) => sum + item.width * item.height, 0);
  const estimatedMs = totalPixels * MS_PER_PIXEL;
  if (estimatedMs < STARTUP_MS * 2) return 1; // startup cost dominates

  return Math.max(1, Math.min(maxConcurrency, items.length, memoryLimit));
}

export async function executeBatch(
  pool: WorkerPool,
  items: ImageDataLike[],
  options?: Partial<DepixelizeOptions> & BatchOptions,
): Promise<DepixelizeBatchResult> {
  if (items.length === 0) {
    return { results: [], totalTimeMs: 0 };
  }

  const { onProgress, maxConcurrency: _mc, maxMemoryMB: _mm, ...depixelizeOptions } =
    options ?? {};
  const start = performance.now();
  let completed = 0;

  const results = await Promise.all(
    items.map(async (item, _i) => {
      const pixels = new Uint8Array(item.data.buffer.slice(0));
      const fn = await pool.acquire();
      try {
        const result = await fn(pixels, item.width, item.height, depixelizeOptions);
        completed++;
        onProgress?.(completed, items.length);
        return result;
      } finally {
        pool.release(fn);
      }
    }),
  );

  return { results, totalTimeMs: performance.now() - start };
}
