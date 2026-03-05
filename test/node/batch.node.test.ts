import { describe, it } from 'node:test';
import assert from 'node:assert';
import { depixelizeBatch } from '../../dist/index.node.js';
import type { ImageDataLike } from '../../dist/index.node.js';

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

describe('depixelizeBatch (Node.js)', () => {
  it('should return empty results for empty array', async () => {
    const { results, totalTimeMs } = await depixelizeBatch([]);
    assert.deepStrictEqual(results, []);
    assert.ok(totalTimeMs >= 0);
  });

  it('should process a single item', async () => {
    const img = createImageData(2, 2, () => [255, 0, 0, 255]);
    const { results } = await depixelizeBatch([img]);

    assert.strictEqual(results.length, 1);
    assert.ok(results[0].svg.includes('<svg'));
    assert.ok(results[0].svg.includes('</svg>'));
    assert.ok(results[0].svg.includes('#ff0000'));
    assert.strictEqual(results[0].width, 2);
    assert.strictEqual(results[0].height, 2);
    assert.ok(results[0].processingTimeMs >= 0);
  });

  it('should process batch of 8 items in order', async () => {
    const items: ImageDataLike[] = [];
    for (let i = 0; i < 8; i++) {
      items.push(
        createImageData(4, 4, (x) =>
          x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255],
        ),
      );
    }

    const { results } = await depixelizeBatch(items, { maxConcurrency: 4 });

    assert.strictEqual(results.length, 8);
    for (const result of results) {
      assert.ok(result.svg.includes('<svg'));
      assert.ok(result.svg.includes('</svg>'));
      assert.strictEqual(result.width, 4);
      assert.strictEqual(result.height, 4);
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

    assert.strictEqual(progressCalls.length, 3);
    for (const [, total] of progressCalls) {
      assert.strictEqual(total, 3);
    }
    const completedValues = progressCalls.map(([c]) => c).sort();
    assert.deepStrictEqual(completedValues, [1, 2, 3]);
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

    assert.strictEqual(results.length, 2);
    for (const result of results) {
      assert.ok(result.svg.includes('<svg'));
    }
  });
});
