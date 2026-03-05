import type { DepixelizeOptions, DepixelizeResult } from './types';
import type { ImageDataLike } from './core';
import { getPool } from './batch';

export async function depixelizeImage(
  imageData: ImageDataLike,
  options?: Partial<DepixelizeOptions>,
): Promise<DepixelizeResult> {
  const pool = getPool();
  const fn = await pool.acquire();
  try {
    const pixels = new Uint8Array(imageData.data.buffer.slice(0));
    return await fn(pixels, imageData.width, imageData.height, options);
  } finally {
    pool.release(fn);
  }
}
