import { describe, it, expect, vi } from 'vitest';
import { page } from 'vitest/browser';

// Import demo's main.ts to set up event listeners on the testerHtmlPath DOM
import '../../demo/main';

describe('Demo workflow', () => {
  it('should load with upload zone visible', async () => {
    const dropZone = page.getByText('Drop a pixel art image here');
    await expect.element(dropZone).toBeVisible();
  });

  it('should display SVG after uploading an image', { timeout: 35000 }, async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 2, 4);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(2, 0, 2, 4);

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const file = new File([blob], 'test.png', { type: 'image/png' });

    const fileInput = document.querySelector('#fileInput') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    const svgOutput = document.querySelector('#svgOutput')!;
    const statusText = document.querySelector('#statusText')!;
    await vi.waitFor(
      () => {
        const status = statusText.textContent || '';
        if (status.startsWith('Error:')) {
          throw new Error(`Demo reported error: ${status}`);
        }
        expect(svgOutput.innerHTML).toContain('<svg');
      },
      { timeout: 30000 },
    );
  });

  it('should show download button after processing', async () => {
    const downloadBtn = page.getByText('Download SVG');
    await expect.element(downloadBtn).toBeVisible();
  });
});
