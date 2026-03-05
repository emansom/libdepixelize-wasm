/// <reference lib="deno.ns" />
import {
  assertEquals,
  assert,
} from 'jsr:@std/assert';
import { depixelizeBatch } from '../../dist/index.deno.js';
import type { ImageDataLike } from '../../dist/index.deno.js';

function createImageData(
  width: number,
  height: number,
  fillFn: (x: number, y: number) => [number, number, number, number],
): ImageDataLike {
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
  return { data, width, height };
}

Deno.test('should return empty results for empty array', async () => {
  const { results, totalTimeMs } = await depixelizeBatch([]);
  assertEquals(results, []);
  assert(totalTimeMs >= 0);
});

Deno.test('should process a single item', async () => {
  const img = createImageData(2, 2, () => [255, 0, 0, 255]);
  const { results } = await depixelizeBatch([img]);

  assertEquals(results.length, 1);
  assert(results[0].svg.includes('<svg'));
  assert(results[0].svg.includes('</svg>'));
  assert(results[0].svg.includes('#ff0000'));
  assertEquals(results[0].width, 2);
  assertEquals(results[0].height, 2);
  assert(results[0].processingTimeMs >= 0);
});

Deno.test('should process batch of 8 items in order', async () => {
  const items: ImageDataLike[] = [];
  for (let i = 0; i < 8; i++) {
    items.push(
      createImageData(4, 4, (x) =>
        x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255],
      ),
    );
  }

  const { results } = await depixelizeBatch(items, { maxConcurrency: 4 });

  assertEquals(results.length, 8);
  for (const result of results) {
    assert(result.svg.includes('<svg'));
    assert(result.svg.includes('</svg>'));
    assertEquals(result.width, 4);
    assertEquals(result.height, 4);
  }
});

Deno.test('should call onProgress for each completed item', async () => {
  const items = [
    createImageData(2, 2, () => [255, 0, 0, 255]),
    createImageData(2, 2, () => [0, 255, 0, 255]),
    createImageData(2, 2, () => [0, 0, 255, 255]),
  ];

  const progressCalls: [number, number][] = [];
  await depixelizeBatch(items, {
    onProgress: (completed: number, total: number) => {
      progressCalls.push([completed, total]);
    },
  });

  assertEquals(progressCalls.length, 3);
  for (const [, total] of progressCalls) {
    assertEquals(total, 3);
  }
  const completedValues = progressCalls.map(([c]) => c).sort();
  assertEquals(completedValues, [1, 2, 3]);
});

Deno.test('should apply shared options to all items', async () => {
  const items = [
    createImageData(4, 4, (x, y) =>
      (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    ),
    createImageData(4, 4, (x, y) =>
      (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    ),
  ];

  const { results } = await depixelizeBatch(items, { method: 'splines' });

  assertEquals(results.length, 2);
  for (const result of results) {
    assert(result.svg.includes('<svg'));
  }
});
