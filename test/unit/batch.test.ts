import { describe, it, expect } from 'vitest';
import { depixelizeBatch } from '../../src/index';
import type { ImageDataLike } from '../../src/index';

function createImageData(
  width: number,
  height: number,
  fillFn: (x: number, y: number) => [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b, a] = fillFn(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return new ImageData(data, width, height);
}

describe('depixelizeBatch', () => {
  it('should return empty results for empty array', async () => {
    const { results, totalTimeMs } = await depixelizeBatch([]);
    expect(results).toEqual([]);
    expect(totalTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should process a single item same as depixelizeImage', async () => {
    const img = createImageData(2, 2, () => [255, 0, 0, 255]);
    const { results } = await depixelizeBatch([img]);

    expect(results).toHaveLength(1);
    expect(results[0].svg).toContain('<svg');
    expect(results[0].svg).toContain('</svg>');
    expect(results[0].svg).toContain('#ff0000');
    expect(results[0].width).toBe(2);
    expect(results[0].height).toBe(2);
    expect(results[0].processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should process batch of 8 items and return results in order', async () => {
    const items: ImageData[] = [];
    for (let i = 0; i < 8; i++) {
      items.push(
        createImageData(4, 4, (x) =>
          x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255],
        ),
      );
    }

    const { results } = await depixelizeBatch(items, { maxConcurrency: 4 });

    expect(results).toHaveLength(8);
    for (const result of results) {
      expect(result.svg).toContain('<svg');
      expect(result.svg).toContain('</svg>');
      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
    }
  });

  it('should call onProgress for each completed item', async () => {
    const items = [
      createImageData(2, 2, () => [255, 0, 0, 255]),
      createImageData(2, 2, () => [0, 255, 0, 255]),
      createImageData(2, 2, () => [0, 0, 255, 255]),
    ];

    const progressCalls: [number, number][] = [];
    await depixelizeBatch(items, {
      onProgress: (completed, total) => {
        progressCalls.push([completed, total]);
      },
    });

    expect(progressCalls).toHaveLength(3);
    for (const [, total] of progressCalls) {
      expect(total).toBe(3);
    }
    // All completion numbers should appear (order may vary due to parallelism)
    const completedValues = progressCalls.map(([c]) => c).sort();
    expect(completedValues).toEqual([1, 2, 3]);
  });

  it('should apply shared options to all items', async () => {
    const items = [
      createImageData(4, 4, (x, y) =>
        (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
      ),
      createImageData(4, 4, (x, y) =>
        (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
      ),
    ];

    const { results } = await depixelizeBatch(items, { method: 'splines' });

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.svg).toContain('<svg');
    }
  });

  it('should report totalTimeMs', async () => {
    const items = [createImageData(2, 2, () => [255, 0, 0, 255])];
    const { totalTimeMs } = await depixelizeBatch(items);
    expect(totalTimeMs).toBeGreaterThanOrEqual(0);
  });
});
