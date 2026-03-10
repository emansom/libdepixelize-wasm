/// <reference lib="deno.ns" />
import {
  assertEquals,
  assertNotEquals,
  assert,
} from 'jsr:@std/assert';
import { PNG } from 'npm:pngjs';
import { Buffer } from 'node:buffer';
import { depixelizeImage } from '../../dist/index.node.js';
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

function loadTestImage(filename: string): ImageDataLike {
  const path = new URL(`../../cpp/vendor/libdepixelize/test/data/${filename}`, import.meta.url);
  const buffer = Deno.readFileSync(path);
  const png = PNG.sync.read(Buffer.from(buffer));
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
}

Deno.test('should produce valid SVG from a solid 2x2 image', async () => {
  const img = createImageData(2, 2, () => [255, 0, 0, 255]);
  const result = await depixelizeImage(img);

  assert(result.svg.includes('<svg'));
  assert(result.svg.includes('</svg>'));
  assert(result.svg.includes('#ff0000'));
  assertEquals(result.width, 2);
  assertEquals(result.height, 2);
  assert(result.processingTimeMs >= 0);
});

Deno.test('should produce multiple paths from a checkerboard 4x4', async () => {
  const img = createImageData(4, 4, (x, y) =>
    (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
  );
  const result = await depixelizeImage(img);

  const pathCount = (result.svg.match(/<path /g) || []).length;
  assert(pathCount > 1, `Expected more than 1 path, got ${pathCount}`);
});

Deno.test('should work with method=splines', async () => {
  const img = createImageData(4, 4, (x) =>
    x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255],
  );
  const result = await depixelizeImage(img, { method: 'splines' });

  assert(result.svg.includes('<svg'));
  assert(result.svg.includes('<path'));
  assert(result.svg.includes('</svg>'));
});

Deno.test('should work with method=voronoi', async () => {
  const img = createImageData(4, 4, (x) =>
    x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255],
  );
  const result = await depixelizeImage(img, { method: 'voronoi' });

  assert(result.svg.includes('<svg'));
  assert(result.svg.includes('<path'));
  assert(result.svg.includes('</svg>'));
});

Deno.test('should work with method=grouped_voronoi', async () => {
  const img = createImageData(4, 4, (x) =>
    x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255],
  );
  const result = await depixelizeImage(img, { method: 'grouped_voronoi' });

  assert(result.svg.includes('<svg'));
  assert(result.svg.includes('<path'));
  assert(result.svg.includes('</svg>'));
});

Deno.test('should respect the optimize option', async () => {
  const img = createImageData(4, 4, (x, y) =>
    (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
  );

  const optimized = await depixelizeImage(img, { method: 'splines', optimize: true });
  const unoptimized = await depixelizeImage(img, { method: 'splines', optimize: false });

  assert(optimized.svg.includes('<svg'));
  assert(unoptimized.svg.includes('<svg'));
  assertNotEquals(optimized.svg, unoptimized.svg);
});

Deno.test('should accept Uint8Array data', async () => {
  const data = new Uint8Array(2 * 2 * 4);
  data.fill(255);
  const img: ImageDataLike = { data, width: 2, height: 2 };
  const result = await depixelizeImage(img);

  assert(result.svg.includes('<svg'));
  assert(result.svg.includes('</svg>'));
});

Deno.test('should accept Uint8ClampedArray data', async () => {
  const data = new Uint8ClampedArray(2 * 2 * 4);
  data.fill(255);
  const img: ImageDataLike = { data, width: 2, height: 2 };
  const result = await depixelizeImage(img);

  assert(result.svg.includes('<svg'));
  assert(result.svg.includes('</svg>'));
});

const SAMPLE_IMAGES = ['smw_boo_input.png', 'sma_toad_input.png', 'pinterest_ctr_frog.png'];
const OUTPUT_MODES = [
  { method: 'voronoi' as const, optimize: false },
  { method: 'grouped_voronoi' as const, optimize: false },
  { method: 'splines' as const, optimize: false },
  { method: 'splines' as const, optimize: true },
  { method: 'isometric' as const, optimize: false },
];

for (const image of SAMPLE_IMAGES) {
  for (const { method, optimize } of OUTPUT_MODES) {
    Deno.test(`sample image: ${image} → method=${method}, optimize=${optimize}`, async () => {
      const img = loadTestImage(image);
      const result = await depixelizeImage(img, { method, optimize });
      assert(result.svg.includes('<svg'));
      assert(result.svg.includes('<path'));
      assert(result.svg.includes('</svg>'));
      assertEquals(result.width, img.width);
      assertEquals(result.height, img.height);
    });
  }
}
