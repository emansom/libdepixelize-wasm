import { describe, it, expect, vi } from 'vitest';

// Import demo's main.ts to set up event listeners on the testerHtmlPath DOM
import '../../demo/main';

/**
 * Upload a file to the demo UI via #fileInput and wait for processing to complete.
 * Returns when statusText shows dimensions (e.g. "113×85").
 */
async function uploadAndWait(file: File, timeout = 55000): Promise<void> {
  const fileInput = document.querySelector('#fileInput') as HTMLInputElement;
  const statusText = document.querySelector('#statusText') as HTMLSpanElement;

  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));

  await vi.waitFor(
    () => {
      const status = statusText.textContent || '';
      if (status.startsWith('Error:')) {
        throw new Error(`Demo reported error: ${status}`);
      }
      // Wait until status shows dimensions like "113×85"
      expect(status).toMatch(/\d+\u00d7\d+/);
    },
    { timeout },
  );
}

/**
 * Scan rendered SVG for white gap pixels at interior opaque positions.
 * Renders the SVG at the given scale on a white-background canvas, then checks
 * that no white pixels appear where the original image has opaque interior pixels.
 *
 * "Interior" = pixel where all 4 cardinal neighbors are also opaque (1px erosion).
 */
async function assertNoWhiteGaps(scale: number): Promise<void> {
  // Get original pixel data from the canvas
  const originalCanvas = document.querySelector('#originalCanvas') as HTMLCanvasElement;
  const origCtx = originalCanvas.getContext('2d')!;
  const origData = origCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
  const w = origData.width;
  const h = origData.height;

  // Build eroded opacity mask: pixel is "interior" if it and all 4 neighbors are opaque
  const mask = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const a = origData.data[idx * 4 + 3];
      if (a < 255) continue;

      const aUp = origData.data[((y - 1) * w + x) * 4 + 3];
      const aDown = origData.data[((y + 1) * w + x) * 4 + 3];
      const aLeft = origData.data[(y * w + (x - 1)) * 4 + 3];
      const aRight = origData.data[(y * w + (x + 1)) * 4 + 3];

      if (aUp === 255 && aDown === 255 && aLeft === 255 && aRight === 255) {
        mask[idx] = 1;
      }
    }
  }

  // Get SVG from output
  const svgOutput = document.querySelector('#svgOutput') as HTMLDivElement;
  const svgEl = svgOutput.querySelector('svg')!;
  expect(svgEl).toBeTruthy();

  // Serialize SVG to blob for rendering
  const serializer = new XMLSerializer();
  // Scale SVG dimensions so the browser rasterizes at target resolution,
  // not at intrinsic pixel size then upscaled.
  const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute('width', String(w * scale));
  svgClone.setAttribute('height', String(h * scale));
  const svgStr = serializer.serializeToString(svgClone);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Render SVG at scale on white-background canvas
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = w * scale;
  renderCanvas.height = h * scale;
  const renderCtx = renderCanvas.getContext('2d')!;
  renderCtx.imageSmoothingEnabled = false;
  renderCtx.fillStyle = '#ffffff';
  renderCtx.fillRect(0, 0, renderCanvas.width, renderCanvas.height);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load SVG as image'));
    img.src = url;
  });

  renderCtx.drawImage(img, 0, 0, renderCanvas.width, renderCanvas.height);
  URL.revokeObjectURL(url);

  const rendered = renderCtx.getImageData(0, 0, renderCanvas.width, renderCanvas.height);

  // Scan for white pixels at interior positions
  let gapPixels = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;

      // Check all sub-pixels within this pixel's scaled region
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const rx = x * scale + sx;
          const ry = y * scale + sy;
          const ri = (ry * renderCanvas.width + rx) * 4;
          const r = rendered.data[ri];
          const g = rendered.data[ri + 1];
          const b = rendered.data[ri + 2];

          if (r > 250 && g > 250 && b > 250) {
            gapPixels++;
          }
        }
      }
    }
  }

  expect(gapPixels, `Found ${gapPixels} white gap pixel(s) at ${scale}x scale`).toBe(0);
}

/**
 * Fetch sofa.png fixture and return as a File object.
 */
async function loadSofaFixture(): Promise<File> {
  const resp = await fetch('/test/fixtures/sofa.png');
  expect(resp.ok, 'Failed to fetch sofa.png fixture').toBe(true);
  const blob = await resp.blob();
  return new File([blob], 'sofa.png', { type: 'image/png' });
}

describe('Gap detection — isometric', () => {
  it(
    'isometric with optimize=false has no white gaps',
    { timeout: 60000 },
    async () => {
      // Set method to isometric, optimize off
      const methodSelect = document.querySelector('#method') as HTMLSelectElement;
      const optimizeCheck = document.querySelector('#optimize') as HTMLInputElement;
      methodSelect.value = 'isometric';
      optimizeCheck.checked = false;

      const file = await loadSofaFixture();
      await uploadAndWait(file);
      await assertNoWhiteGaps(10);
    },
  );

  it(
    'isometric with optimize=true has no white gaps',
    { timeout: 60000 },
    async () => {
      // Set method to isometric, optimize on
      const methodSelect = document.querySelector('#method') as HTMLSelectElement;
      const optimizeCheck = document.querySelector('#optimize') as HTMLInputElement;
      methodSelect.value = 'isometric';
      optimizeCheck.checked = true;

      const file = await loadSofaFixture();
      await uploadAndWait(file);
      await assertNoWhiteGaps(10);
    },
  );
});
