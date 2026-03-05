import * as Comlink from 'comlink';
import DepixelizeWorker from './worker/depixelize.worker?worker&inline';
import type { DepixelizeOptions, DepixelizeResult, BatchOptions, DepixelizeBatchResult } from './types';
import type { ImageDataLike } from './core';
import { WorkerPool, calculateConcurrency, executeBatch } from './pool';
import type { ProcessFn } from './pool';

interface WorkerAPI {
  depixelize(
    rgbaPixels: Uint8Array,
    width: number,
    height: number,
    options?: Partial<DepixelizeOptions>,
  ): Promise<DepixelizeResult>;
}

const workerRefs = new Map<ProcessFn, { worker: Worker; api: Comlink.Remote<WorkerAPI> }>();

function createBrowserProcessFn(): Promise<ProcessFn> {
  return new Promise<ProcessFn>((resolve) => {
    const worker = new DepixelizeWorker();
    const api = Comlink.wrap<WorkerAPI>(worker);

    const fn: ProcessFn = async (pixels, width, height, options) => {
      const transferred = new Uint8Array(pixels.buffer.slice(0));
      return api.depixelize(
        Comlink.transfer(transferred, [transferred.buffer]),
        width,
        height,
        options,
      );
    };

    workerRefs.set(fn, { worker, api });
    resolve(fn);
  });
}

async function destroyBrowserProcessFn(fn: ProcessFn): Promise<void> {
  const ref = workerRefs.get(fn);
  if (ref) {
    ref.api[Comlink.releaseProxy]();
    ref.worker.terminate();
    workerRefs.delete(fn);
  }
}

function getDefaultConcurrency(): number {
  return typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : 4;
}

let defaultPool: WorkerPool | null = null;

export function getPool(maxSize?: number): WorkerPool {
  if (!defaultPool) {
    defaultPool = new WorkerPool(
      createBrowserProcessFn,
      maxSize ?? getDefaultConcurrency(),
      destroyBrowserProcessFn,
    );
  } else if (maxSize !== undefined) {
    defaultPool.resize(maxSize);
  }
  return defaultPool;
}

export async function depixelizeBatch(
  items: ImageDataLike[],
  options?: Partial<DepixelizeOptions> & BatchOptions,
): Promise<DepixelizeBatchResult> {
  const maxConcurrency = options?.maxConcurrency ?? getDefaultConcurrency();
  const maxMemoryMB = options?.maxMemoryMB ?? 512;
  const concurrency = calculateConcurrency(items, maxConcurrency, maxMemoryMB);
  const pool = getPool(concurrency);
  return executeBatch(pool, items, options);
}
