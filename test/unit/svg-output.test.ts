import { describe, it, expect } from 'vitest';
import { depixelizeImage } from '../../src/index';

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

describe('SVG output', () => {
  it('should have correct width and height attributes', async () => {
    const img = createImageData(8, 6, () => [128, 128, 128, 255]);
    const result = await depixelizeImage(img);

    expect(result.svg).toContain('width="8"');
    expect(result.svg).toContain('height="6"');
    expect(result.svg).toContain('viewBox="0 0 8 6"');
  });

  it('should have valid d attributes on paths', async () => {
    const img = createImageData(4, 4, (x) =>
      x < 2 ? [255, 0, 0, 255] : [0, 255, 0, 255],
    );
    const result = await depixelizeImage(img);

    // Extract all d attributes
    const dValues = [...result.svg.matchAll(/d="([^"]+)"/g)].map((m) => m[1]);
    expect(dValues.length).toBeGreaterThan(0);

    for (const d of dValues) {
      // Should start with M (moveto) command
      expect(d).toMatch(/^[Mm]/);
    }
  });

  it('should have properly hex-encoded colors', async () => {
    const img = createImageData(2, 2, () => [0, 128, 255, 255]);
    const result = await depixelizeImage(img);

    // Expect hex color like #0080ff
    expect(result.svg).toMatch(/fill="#[0-9a-f]{6}"/);
  });

  it('should include fill-opacity when alpha < 255', async () => {
    const img = createImageData(2, 2, () => [255, 0, 0, 128]);
    const result = await depixelizeImage(img);

    expect(result.svg).toContain('fill-opacity=');
  });

  it('should not include fill-opacity when alpha is 255', async () => {
    const img = createImageData(2, 2, () => [255, 0, 0, 255]);
    const result = await depixelizeImage(img);

    expect(result.svg).not.toContain('fill-opacity=');
  });
});
