import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { depixelizeImage, DEFAULT_OPTIONS } from '../../dist/index.node.js';
import type { ImageDataLike } from '../../dist/index.node.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA = join(__dirname, '../../cpp/vendor/libdepixelize/test/data');

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

function loadTestImage(filename: string): ImageDataLike {
  const buffer = readFileSync(join(TEST_DATA, filename));
  const png = PNG.sync.read(buffer);
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
}

describe('depixelizeImage (Node.js)', () => {
  it('should produce valid SVG from a solid 2x2 image', async () => {
    const img = createImageData(2, 2, () => [255, 0, 0, 255]);
    const result = await depixelizeImage(img);

    assert.ok(result.svg.includes('<svg'));
    assert.ok(result.svg.includes('</svg>'));
    assert.ok(result.svg.includes('#ff0000'));
    assert.strictEqual(result.width, 2);
    assert.strictEqual(result.height, 2);
    assert.ok(result.processingTimeMs >= 0);
  });

  it('should produce multiple paths from a checkerboard 4x4', async () => {
    const img = createImageData(4, 4, (x, y) =>
      (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    const result = await depixelizeImage(img);

    const pathCount = (result.svg.match(/<path /g) || []).length;
    assert.ok(pathCount > 1, `Expected more than 1 path, got ${pathCount}`);
  });

  it('should work with method=splines', async () => {
    const img = createImageData(4, 4, (x) =>
      x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255],
    );
    const result = await depixelizeImage(img, { method: 'splines' });

    assert.ok(result.svg.includes('<svg'));
    assert.ok(result.svg.includes('<path'));
    assert.ok(result.svg.includes('</svg>'));
  });

  it('should work with method=voronoi', async () => {
    const img = createImageData(4, 4, (x) =>
      x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255],
    );
    const result = await depixelizeImage(img, { method: 'voronoi' });

    assert.ok(result.svg.includes('<svg'));
    assert.ok(result.svg.includes('<path'));
    assert.ok(result.svg.includes('</svg>'));
  });

  it('should work with method=grouped_voronoi', async () => {
    const img = createImageData(4, 4, (x) =>
      x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255],
    );
    const result = await depixelizeImage(img, { method: 'grouped_voronoi' });

    assert.ok(result.svg.includes('<svg'));
    assert.ok(result.svg.includes('<path'));
    assert.ok(result.svg.includes('</svg>'));
  });

  it('should respect the optimize option', async () => {
    const img = createImageData(4, 4, (x, y) =>
      (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );

    const optimized = await depixelizeImage(img, { method: 'splines', optimize: true });
    const unoptimized = await depixelizeImage(img, { method: 'splines', optimize: false });

    assert.ok(optimized.svg.includes('<svg'));
    assert.ok(unoptimized.svg.includes('<svg'));
    assert.notStrictEqual(optimized.svg, unoptimized.svg);
  });

  it('should accept Uint8Array data', async () => {
    const data = new Uint8Array(2 * 2 * 4);
    data.fill(255);
    const img: ImageDataLike = { data, width: 2, height: 2 };
    const result = await depixelizeImage(img);

    assert.ok(result.svg.includes('<svg'));
    assert.ok(result.svg.includes('</svg>'));
  });

  it('should accept Uint8ClampedArray data', async () => {
    const data = new Uint8ClampedArray(2 * 2 * 4);
    data.fill(255);
    const img: ImageDataLike = { data, width: 2, height: 2 };
    const result = await depixelizeImage(img);

    assert.ok(result.svg.includes('<svg'));
    assert.ok(result.svg.includes('</svg>'));
  });
});

const SAMPLE_IMAGES = ['smw_boo_input.png', 'sma_toad_input.png', 'pinterest_ctr_frog.png'];
const OUTPUT_MODES = [
  { method: 'voronoi' as const, optimize: false },
  { method: 'grouped_voronoi' as const, optimize: false },
  { method: 'splines' as const, optimize: false },
  { method: 'splines' as const, optimize: true },
];

for (const image of SAMPLE_IMAGES) {
  describe(`sample image: ${image}`, () => {
    for (const { method, optimize } of OUTPUT_MODES) {
      it(`method=${method}, optimize=${optimize}`, async () => {
        const img = loadTestImage(image);
        const result = await depixelizeImage(img, { method, optimize });
        assert.ok(result.svg.includes('<svg'));
        assert.ok(result.svg.includes('<path'));
        assert.ok(result.svg.includes('</svg>'));
        assert.strictEqual(result.width, img.width);
        assert.strictEqual(result.height, img.height);
      });
    }
  });
}
