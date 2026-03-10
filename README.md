# libdepixelize-wasm

WebAssembly bindings for [libdepixelize](https://gitlab.com/inkscape/devel/libdepixelize) — the Kopf-Lischinski pixel art vectorization algorithm. Converts raster pixel art into resolution-independent SVG vector graphics.

## Installation

```bash
npm install libdepixelize-wasm
```

## Usage

```typescript
import { depixelizeImage } from 'libdepixelize-wasm';

// Get ImageData from a canvas
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
// ... draw your pixel art to canvas ...
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

const result = await depixelizeImage(imageData, {
  method: 'voronoi',       // 'splines' | 'voronoi' | 'grouped_voronoi' | 'isometric'
  curvesMultiplier: 1.0,
  islandsWeight: 5,
  sparsePixelsMultiplier: 1.0,
  sparsePixelsRadius: 4,
  optimize: false,
});

console.log(result.svg);              // SVG string
console.log(result.processingTimeMs); // processing time in ms
```

## API

### `depixelizeImage(imageData: ImageData, options?: Partial<DepixelizeOptions>): Promise<DepixelizeResult>`

Vectorizes pixel art using the Kopf-Lischinski algorithm. Runs in a WebWorker to avoid blocking the main thread.

### `depixelizeBatch(items: ImageDataLike[], options?: Partial<DepixelizeOptions> & BatchOptions): Promise<DepixelizeBatchResult>`

Batch-process multiple images in parallel using a worker pool. Ideal for spritesheets and texture atlases. Automatically sizes the pool based on available cores and memory budget.

```typescript
import { depixelizeBatch } from 'libdepixelize-wasm';

const sprites: ImageDataLike[] = extractSprites(spritesheet);
const { results } = await depixelizeBatch(sprites, {
  method: 'voronoi',
  maxConcurrency: 8,
  onProgress: (done, total) => console.log(`${done}/${total}`),
});
// results[i] corresponds to sprites[i]
```

### `BatchOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxConcurrency` | `number` | `navigator.hardwareConcurrency \|\| 4` | Maximum number of concurrent workers |
| `maxMemoryMB` | `number` | `512` | Maximum total memory budget in MB for worker pool |
| `onProgress` | `(completed: number, total: number) => void` | — | Progress callback invoked after each image completes |

### `DepixelizeBatchResult`

| Field | Type | Description |
|-------|------|-------------|
| `results` | `DepixelizeResult[]` | Results in the same order as input items |
| `totalTimeMs` | `number` | Total wall-clock time for the entire batch in ms |

### `DepixelizeOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `method` | `'splines' \| 'voronoi' \| 'grouped_voronoi' \| 'isometric'` | `'voronoi'` | Vectorization method |
| `curvesMultiplier` | `number` | `1.0` | Weight for curves heuristic |
| `islandsWeight` | `number` | `5` | Weight for islands heuristic |
| `sparsePixelsMultiplier` | `number` | `1.0` | Weight for sparse pixels heuristic |
| `sparsePixelsRadius` | `number` | `4` | Radius for sparse pixel detection |
| `optimize` | `boolean` | `false` | Enable Kopf-Lischinski path optimization |

> **Note:** Defaults are aligned with Inkscape's Trace Bitmap dialog, the canonical UI for libdepixelize.

### Isometric Mode

The `'isometric'` method is optimized for isometric pixel art (2:1 dimetric projection, ~26.565° diagonals). It uses a region-adaptive heuristic that detects three pattern families at each crossing-diagonal site:

- **2:1 horizontal staircases** — isometric X/Z-axis lines
- **1:2 vertical staircases** — isometric Y-axis lines
- **1:1 diagonal continuations** — forward-facing / normal pixel art regions

This makes it rotation-invariant: sprites facing any direction within the isometric plane are handled correctly, with each region receiving the appropriate heuristic treatment.

```typescript
const result = await depixelizeImage(imageData, {
  method: 'isometric',
});
```

### `DepixelizeResult`

| Field | Type | Description |
|-------|------|-------------|
| `svg` | `string` | Complete SVG document string |
| `width` | `number` | Image width in pixels |
| `height` | `number` | Image height in pixels |
| `processingTimeMs` | `number` | Processing time in milliseconds |

## Building from Source

### Prerequisites

- **Emscripten SDK (emsdk)**: Required for compiling C++ to WebAssembly
- **CMake** >= 3.13
- **Node.js** >= 18
- **patch** utility

### Setting up Emscripten

Install and activate the Emscripten SDK:

```bash
# On Arch Linux (via pacman)
sudo pacman -S emscripten emsdk
sudo emsdk install latest
sudo emsdk activate latest

# On other systems, download emsdk:
# https://emscripten.org/docs/getting_started/downloads.html
# git clone https://github.com/emscripten-core/emsdk.git
# cd emsdk && ./emsdk install latest && ./emsdk activate latest
```

Activate the environment (run this in each new shell, or add to your profile):

```bash
source emsdk_env.sh
# On Arch Linux: source /usr/bin/emsdk_env.sh
```

Pre-build the Boost headers Emscripten port:

```bash
embuilder build boost_headers
# On Arch Linux the path may be: /usr/lib/emscripten/embuilder
```

### Building

```bash
# Initialize git submodules (if using git checkout)
git submodule update --init --recursive

# Build WASM
npm run build:wasm

# Install npm dependencies
npm install

# Build the library
npm run build
```

### Development

```bash
# Start demo dev server
npm run dev

# Run unit tests
npm test

# Run E2E browser tests
npm run test:e2e
```

## Project Structure

```
src/           - TypeScript library source (published to npm)
wasm/          - Pre-built WASM binary + JS glue (published to npm)
demo/          - Demo application (not published)
cpp/           - C++ source, patches, and CMake build
test/          - Unit and E2E tests
```

## License

LGPL-2.1-or-later OR GPL-2.0-or-later (same as libdepixelize)
