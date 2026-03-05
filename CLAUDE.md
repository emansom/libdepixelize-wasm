# CLAUDE.md

## Project Overview

libdepixelize-wasm: WebAssembly bindings for the Kopf-Lischinski pixel art vectorization algorithm (from Inkscape's libdepixelize C++ library), wrapped in a WebWorker with Comlink.

## Architecture

- `cpp/` — C++ build pipeline: vendor sources, patches, CMake, Embind bindings
- `src/` — TypeScript library: types, WebWorker, Comlink API, index re-exports
- `demo/` — Standalone demo app (not published to npm)
- `test/` — Unit tests (vitest) and E2E browser tests (playwright)
- `wasm/` — Build output: depixelize.js + depixelize.wasm

## Emscripten Setup

Before building WASM, the Emscripten SDK must be installed and activated:

```bash
sudo emsdk install latest
sudo emsdk activate latest
source emsdk_env.sh          # Arch Linux: source /usr/bin/emsdk_env.sh
embuilder build boost_headers # Arch Linux: /usr/lib/emscripten/embuilder build boost_headers
```

If a user encounters WASM build failures, prompt them to verify their emsdk setup.

## Key Commands

- `npm run build:wasm` — Build C++ to WASM (sources emsdk internally; no need to `source emsdk_env.sh` first)
- `npm run build` — Build TypeScript library to dist/
- `npm run dev` — Start demo dev server
- `npm test` — Run unit tests
- `npm run test:e2e` — Run E2E browser tests

## Vendor Dependencies

Submodules in `cpp/vendor/`:
- libdepixelize (GitLab: inkscape/devel/libdepixelize)
- lib2geom (GitLab: inkscape/lib2geom)
- double-conversion (GitHub: google/double-conversion)
- gsl (GitHub: ampl/gsl — CMake-enabled fork)

Patches in `cpp/patches/` guard glib/GTK/Python deps behind `if(NOT EMSCRIPTEN)`.

## Build Order

double-conversion → GSL → lib2geom → libdepixelize → Embind bindings

## Default Options

Defaults are aligned with Inkscape's Trace Bitmap dialog:

| Option | Default | Notes |
|--------|---------|-------|
| `method` | `'voronoi'` | Inkscape default |
| `curvesMultiplier` | `1.0` | |
| `islandsWeight` | `5` | C++ default is also 5 |
| `sparsePixelsMultiplier` | `1.0` | |
| `sparsePixelsRadius` | `4` | |
| `optimize` | `false` | Inkscape leaves unchecked |

When changing defaults, update `src/types.ts`, `demo/index.html`, `README.md`, and this file.

## Worker Pool & Batch Processing

- `src/pool.ts` — Generic `WorkerPool` (acquire/release/queue), `calculateConcurrency()`, `executeBatch()`
- `src/batch.ts` — Browser: WebWorker + Comlink factory, module-level default pool, `depixelizeBatch()`
- `src/batch.node.ts` — Node.js: `worker_threads` factory, `depixelizeBatch()`
- `src/batch.deno.ts` — Deno: `Deno.Worker` factory, `depixelizeBatch()`
- `src/worker/depixelize.worker-core.ts` — Shared WASM loading + message protocol for Node/Deno workers
- `src/worker/depixelize.node-worker.ts` — Node.js `parentPort` adapter
- `src/worker/depixelize.deno-worker.ts` — Deno `self.onmessage` adapter
- `src/index.deno.ts` — Deno export entry point

`depixelizeImage` (browser) shares the same pool as `depixelizeBatch`. Smart concurrency sizing accounts for memory budget and startup cost vs processing time.

## Testing Policy

**Always run both unit and E2E tests after any source code modification:**

```bash
npm test          # Unit tests (vitest + playwright chromium)
npm run test:e2e  # E2E browser tests
```
