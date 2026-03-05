import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import type { DepixelizeOptions, DepixelizeResult, BatchOptions, DepixelizeBatchResult } from './types.js';
import type { ImageDataLike } from './core.js';
import { WorkerPool, calculateConcurrency, executeBatch } from './pool.js';
import type { ProcessFn } from './pool.js';
import type { WorkerResponse } from './worker/depixelize.worker-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerPath = join(__dirname, 'worker', 'depixelize.node-worker.js');

const workerInstances = new Map<ProcessFn, Worker>();

function createNodeProcessFn(): Promise<ProcessFn> {
  return new Promise<ProcessFn>((resolve, reject) => {
    const worker = new Worker(workerPath);
    worker.unref();

    let nextId = 0;
    const pending = new Map<
      number,
      { resolve: (r: DepixelizeResult) => void; reject: (e: Error) => void }
    >();

    worker.on('message', (msg: WorkerResponse) => {
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
              [buffer as ArrayBuffer],
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
    });

    worker.on('error', (err) => {
      reject(err);
      for (const p of pending.values()) {
        p.reject(err);
      }
      pending.clear();
    });
  });
}

async function destroyNodeProcessFn(fn: ProcessFn): Promise<void> {
  const worker = workerInstances.get(fn);
  if (worker) {
    await worker.terminate();
    workerInstances.delete(fn);
  }
}

function getDefaultConcurrency(): number {
  return cpus().length || 4;
}

export async function depixelizeBatch(
  items: ImageDataLike[],
  options?: Partial<DepixelizeOptions> & BatchOptions,
): Promise<DepixelizeBatchResult> {
  const maxConcurrency = options?.maxConcurrency ?? getDefaultConcurrency();
  const maxMemoryMB = options?.maxMemoryMB ?? 512;
  const concurrency = calculateConcurrency(items, maxConcurrency, maxMemoryMB);

  const pool = new WorkerPool(createNodeProcessFn, concurrency, destroyNodeProcessFn);
  try {
    return await executeBatch(pool, items, options);
  } finally {
    await pool.destroy();
  }
}
