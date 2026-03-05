import { depixelizeImage, DEFAULT_OPTIONS } from '../src/index';
import type { DepixelizeOptions } from '../src/index';

const dropZone = document.getElementById('dropZone') as HTMLDivElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const originalCanvas = document.getElementById('originalCanvas') as HTMLCanvasElement;
const svgOutput = document.getElementById('svgOutput') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;
const loadingOverlay = document.getElementById('loadingOverlay') as HTMLDivElement;

const methodSelect = document.getElementById('method') as HTMLSelectElement;
const curvesSlider = document.getElementById('curvesMultiplier') as HTMLInputElement;
const islandsSlider = document.getElementById('islandsWeight') as HTMLInputElement;
const sparseMultSlider = document.getElementById('sparsePixelsMultiplier') as HTMLInputElement;
const sparseRadiusSlider = document.getElementById('sparsePixelsRadius') as HTMLInputElement;
const optimizeCheck = document.getElementById('optimize') as HTMLInputElement;

let currentImageData: ImageData | null = null;
let currentSvg = '';

function getOptions(): Partial<DepixelizeOptions> {
  return {
    method: methodSelect.value as DepixelizeOptions['method'],
    curvesMultiplier: parseFloat(curvesSlider.value),
    islandsWeight: parseFloat(islandsSlider.value),
    sparsePixelsMultiplier: parseFloat(sparseMultSlider.value),
    sparsePixelsRadius: parseInt(sparseRadiusSlider.value, 10),
    optimize: optimizeCheck.checked,
  };
}

function updateSliderLabels() {
  document.getElementById('curvesMultiplierVal')!.textContent = parseFloat(curvesSlider.value).toFixed(1);
  document.getElementById('islandsWeightVal')!.textContent = parseFloat(islandsSlider.value).toFixed(0);
  document.getElementById('sparsePixelsMultiplierVal')!.textContent = parseFloat(sparseMultSlider.value).toFixed(1);
  document.getElementById('sparsePixelsRadiusVal')!.textContent = sparseRadiusSlider.value;
}

async function processImage() {
  if (!currentImageData) return;

  loadingOverlay.hidden = false;
  statusText.textContent = 'Processing...';
  downloadBtn.hidden = true;

  try {
    const result = await depixelizeImage(currentImageData, getOptions());
    currentSvg = result.svg;
    svgOutput.innerHTML = result.svg;
    statusText.textContent = `Done in ${result.processingTimeMs.toFixed(0)}ms (${result.width}×${result.height})`;
    downloadBtn.hidden = false;
  } catch (err) {
    statusText.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    loadingOverlay.hidden = true;
  }
}

function loadImage(file: File) {
  const img = new Image();
  img.onload = () => {
    originalCanvas.width = img.width;
    originalCanvas.height = img.height;
    const ctx = originalCanvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    currentImageData = ctx.getImageData(0, 0, img.width, img.height);
    URL.revokeObjectURL(img.src);
    processImage();
  };
  img.src = URL.createObjectURL(file);
}

// Drag & drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file) loadImage(file);
});

// File input
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadImage(file);
});

// Options change → re-process
for (const el of [methodSelect, curvesSlider, islandsSlider, sparseMultSlider, sparseRadiusSlider, optimizeCheck]) {
  el.addEventListener('input', () => {
    updateSliderLabels();
    processImage();
  });
}

// Download SVG
downloadBtn.addEventListener('click', () => {
  if (!currentSvg) return;
  const blob = new Blob([currentSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'depixelized.svg';
  a.click();
  URL.revokeObjectURL(url);
});
