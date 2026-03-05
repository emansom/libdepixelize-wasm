// @ts-nocheck — Deno batch: only compiled by tsconfig.deno.json or Deno runtime
import type { DepixelizeOptions, DepixelizeResult, BatchOptions, DepixelizeBatchResult } from './types.js';
import type { ImageDataLike } from './core.js';
import { WorkerPool, calculateConcurrency, executeBatch } from './pool.js';
import type { ProcessFn } from './pool.js';
import type { WorkerResponse } from './worker/depixelize.worker-core.js';

const workerUrl = new URL('./worker/depixelize.deno-worker.js', import.meta.url);

const workerInstances = new Map<ProcessFn, Worker>();

function createDenoProcessFn(): Promise<ProcessFn> {
  return new Promise<ProcessFn>((resolve, reject) => {
    const worker = new Worker(workerUrl, { type: 'module' });

    let nextId = 0;
    const pending = new Map<
      number,
      { resolve: (r: DepixelizeResult) => void; reject: (e: Error) => void }
    >();

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;

      if (msg.type === 'ready') {
        const fn: ProcessFn = async (pixels, width, height, options) => {
          const id = nextId++;
          return new Promise<DepixelizeResult>((res, rej) => {
            pending.set(id, { resolve: res, reject: rej });
            const buffer = pixels.buffer.slice(
              pixels.byteOffset,
              pixels.byteOffset + pixels.byteLength,
            );
            worker.postMessage(
              { id, pixels: buffer, width, height, options },
              [buffer],
            );
          });
        };
        workerInstances.set(fn, worker);
        resolve(fn);
        return;
      }

      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          if (msg.error) {
            p.reject(new Error(msg.error));
          } else {
            p.resolve(msg.result!);
          }
        }
      }
    };

    worker.onerror = (err) => {
      reject(err);
      for (const p of pending.values()) {
        p.reject(new Error(String(err)));
      }
      pending.clear();
    };
  });
}

async function destroyDenoProcessFn(fn: ProcessFn): Promise<void> {
  const worker = workerInstances.get(fn);
  if (worker) {
    worker.terminate();
    workerInstances.delete(fn);
  }
}

function getDefaultConcurrency(): number {
  return (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
}

export async function depixelizeBatch(
  items: ImageDataLike[],
  options?: Partial<DepixelizeOptions> & BatchOptions,
): Promise<DepixelizeBatchResult> {
  const maxConcurrency = options?.maxConcurrency ?? getDefaultConcurrency();
  const maxMemoryMB = options?.maxMemoryMB ?? 512;
  const concurrency = calculateConcurrency(items, maxConcurrency, maxMemoryMB);

  const pool = new WorkerPool(createDenoProcessFn, concurrency, destroyDenoProcessFn);
  try {
    return await executeBatch(pool, items, options);
  } finally {
    await pool.destroy();
  }
}
