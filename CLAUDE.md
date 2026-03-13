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

## Git Policy

**IMPORTANT**: git is on the blocked commands list. Claude must NEVER execute git commands directly. ALL git commands must be prompted to the user via AskUserQuestion — the user will execute them manually and confirm completion before Claude continues.

## Patch Modification Workflow

To modify any vendor patch file in `cpp/patches/`, always follow this workflow:

1. **Reset vendor submodule** — prompt user to run git commands:
   ```bash
   cd cpp/vendor/<submodule>
   git checkout <pinned-commit>
   git clean -fd
   git checkout .
   ```
   Pinned commits are in `scripts/build-wasm.sh` (the `pin_vendor` calls).

2. **Apply current patch** to the vendor copy:
   ```bash
   patch -p1 -d cpp/vendor/<submodule> < cpp/patches/<patch-file>.patch
   ```

3. **Edit source files** directly in `cpp/vendor/<submodule>/`

4. **Backup old patch** — never overwrite existing backups, increment suffix:
   ```bash
   cp cpp/patches/<patch>.patch cpp/patches/<patch>_old.patch   # or _old2, _old3...
   ```

5. **Generate new patch** — prompt user to run git commands:
   ```bash
   cd cpp/vendor/<submodule>
   git diff > ../../patches/<patch-file>.patch
   ```

6. **Reset vendor** back to clean — prompt user to run git commands:
   ```bash
   cd cpp/vendor/<submodule>
   git checkout .
   git clean -fd
   ```

7. **Verify** — run `npm run build:wasm` (applies patch to temp copy during build)

**IMPORTANT**: git is on the blocked commands list. Claude must NEVER execute
git commands directly. ALL git commands must be prompted to the user via
AskUserQuestion.

## Isometric Vectorization (Custom Patch)

The isometric mode (`method: 'isometric'`) is a custom extension to libdepixelize,
implemented as a patch file applied during the WASM build:

- **Patch file**: `cpp/patches/libdepixelize-isometric.patch`
- **Applied by**: `scripts/build-wasm.sh` line 127 (to temp copy, never modifies submodule)
- **Test fixtures**: `cpp/patches/libdepixelize-isometric-testdata.patch`
- **Upstream docs**: `cpp/patches/libdepixelize-isometric-upstream.md`
- **Research**: `docs/isometric-vectorization-research.md`

The patch adds a `to_isometric()` function with a region-adaptive heuristic that
detects three pattern families at each crossing-diagonal site:
1. 2:1 horizontal staircases (isometric X/Z-axis lines)
2. 1:2 vertical staircases (isometric Y-axis lines)
3. 1:1 diagonal continuations (forward-facing/normal pixel art)

Multi-step confirmation reduces false positives. The optimization pass accepts
extended border slopes (2 and 0.5) for dimetric angles.

## Gap Prevention Policy

Background pixel rects prevent white gaps between vectorized paths:

- Three rect layers: square base rects (gap-free), horizontal rounded rects
  (`rx=".5" ry=".5"` for smooth edges), and vertical rounded rects
- Square base rects guarantee full pixel coverage on integer coordinates;
  rounded rects paint on top for visual smoothing at color boundaries
- `image-rendering: optimizeQuality` on svg root for quality rendering
- `shape-rendering: geometricPrecision` on paths and rects by default
  (fractional DPR fallback); overridden to `crispEdges` at integer DPRs
  (1–4x) via `@media (resolution)` query for optimal pixel snapping
- Rects are always layered below the vectorized paths
- E2E gap detection test renders SVG at scaled resolution (not intrinsic
  size) to detect sub-pixel gaps visible at browser zoom
- E2E tests verify both integer (10x) and fractional (1.5x, 2.5x) scales
- E2E gap detection test must always pass with zero white pixels
- The white threshold in the gap detection test must never be adjusted

## Testing Policy

**Always run both unit and E2E tests after any source code modification:**

```bash
npm test          # Unit tests (vitest + playwright chromium)
npm run test:e2e  # E2E browser tests
```
