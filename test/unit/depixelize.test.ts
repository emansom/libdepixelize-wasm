import { describe, it, expect } from 'vitest';
import { depixelizeImage, DEFAULT_OPTIONS } from '../../src/index';
import type { DepixelizeOptions } from '../../src/index';

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

const OUTPUT_MODES = [
  { method: 'voronoi' as const, optimize: false, label: 'voronoi' },
  { method: 'grouped_voronoi' as const, optimize: false, label: 'grouped_voronoi' },
  { method: 'splines' as const, optimize: false, label: 'splines (no optimize)' },
  { method: 'splines' as const, optimize: true, label: 'splines (optimized)' },
  { method: 'isometric' as const, optimize: false, label: 'isometric' },
];

describe('depixelizeImage', () => {
  it('should produce valid SVG from a solid 2x2 image', async () => {
    const img = createImageData(2, 2, () => [255, 0, 0, 255]);
    const result = await depixelizeImage(img);

    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('</svg>');
    expect(result.svg).toContain('#ff0000');
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should produce multiple paths from a checkerboard 4x4', async () => {
    const img = createImageData(4, 4, (x, y) =>
      (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    const result = await depixelizeImage(img);

    const pathCount = (result.svg.match(/<path /g) || []).length;
    expect(pathCount).toBeGreaterThan(1);
  });

  it('should respect the optimize option', async () => {
    const img = createImageData(4, 4, (x, y) =>
      (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );

    const optimized = await depixelizeImage(img, { method: 'splines', optimize: true });
    const unoptimized = await depixelizeImage(img, { method: 'splines', optimize: false });

    expect(optimized.svg).toContain('<svg');
    expect(unoptimized.svg).toContain('<svg');
    // Optimized version typically has different path data
    expect(optimized.svg).not.toBe(unoptimized.svg);
  });

  for (const { method, optimize, label } of OUTPUT_MODES) {
    it(`should produce valid SVG in ${label} mode`, async () => {
      const img = createImageData(8, 8, (x, y) =>
        x < 4 ? (y < 4 ? [255, 0, 0, 255] : [0, 255, 0, 255])
               : (y < 4 ? [0, 0, 255, 255] : [255, 255, 0, 255]),
      );
      const result = await depixelizeImage(img, { method, optimize });
      expect(result.svg).toContain('<svg');
      expect(result.svg).toContain('<path');
      expect(result.svg).toContain('</svg>');
    });
  }
});

async function loadPngAsImageData(relativePath: string): Promise<ImageData> {
  const resp = await fetch(`/${relativePath}`);
  const blob = await resp.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

describe('sample images (upstream test data)', () => {
  const SAMPLE_IMAGES = ['smw_boo_input.png', 'sma_toad_input.png', 'pinterest_ctr_frog.png'];
  for (const image of SAMPLE_IMAGES) {
    for (const { method, optimize, label } of OUTPUT_MODES) {
      it(`${image} → ${label}`, async () => {
        const img = await loadPngAsImageData(`cpp/vendor/libdepixelize/test/data/${image}`);
        const result = await depixelizeImage(img, { method, optimize });
        expect(result.svg).toContain('<svg');
        expect(result.svg).toContain('<path');
        expect(result.svg).toContain('</svg>');
        expect(result.width).toBe(img.width);
        expect(result.height).toBe(img.height);
      });
    }
  }
});
