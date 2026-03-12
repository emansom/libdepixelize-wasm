# Upstream PR/Commit Metadata for libdepixelize Isometric Patch

## Git Commit

### Title
```
Add region-adaptive isometric pixel art vectorization (to_isometric)
```

### Body
```
Add a new to_isometric() output method for isometric pixel art with a
rotation-invariant, region-adaptive heuristic for crossing-edge resolution.

Isometric pixel art sprites face multiple directions within the isometric
plane, making a single image heterogeneous: side-facing surfaces have 2:1
staircase patterns, top/bottom surfaces have 1:2 patterns, and
forward-facing surfaces use standard pixel art conventions (1:1 diagonals,
vertical/horizontal lines). The algorithm must therefore be region-adaptive,
choosing the correct heuristic at each crossing-diagonal site.

This commit adds:

1. A region-adaptive "isometric diagonals" heuristic in
   _remove_crossing_edges_unsafe() that detects three pattern families at
   each crossing-diagonal site:

   a) 2:1 horizontal staircase — checks for connected cardinal neighbors
      H=(ax-dx,ay) and J=(bx+dx,by) extending the step horizontally.
      Multi-step: predecessor diagonal from H, successor diagonal to J.

   b) 1:2 vertical staircase — checks for connected cardinal neighbors
      V_a=(ax,ay-dy) and V_b=(bx,by+dy) extending the step vertically.
      Multi-step: predecessor diagonal from V_a, successor diagonal to V_b.

   c) 1:1 diagonal continuation — checks for diagonal predecessor
      diag_adj(*a,-dx,-dy) and/or successor diag_adj(*b,dx,dy). Handles
      forward-facing regions that use standard pixel art diagonals.

   Each path scores +1 for single-step detection, +1 for multi-step
   confirmation. Score range: 0-6. Multi-step confirmation significantly
   reduces false positives compared to single-step detection alone.

2. An extended border slope validator (is_valid_border_m_isometric) for
   the optimization pass that additionally recognizes slopes 2 and 0.5
   (the 2:1 and 1:2 dimetric angles), preventing the Kopf-Lischinski
   path relaxation from distorting straight isometric diagonal lines.
   Threaded through the optimize() call chain via a bool isometric=false
   default parameter, so existing methods are unaffected.

3. Fix for stale prev/next references in optimize() when
   border_detection() skips multiple points. After skip > 0, the loop now
   continues to the next iteration instead of falling through to the
   optimization loop with stale neighbor references. This prevents spike
   artifacts ("splintering") that occurred when the last point of a
   detected border sequence was optimized against wrong neighbors.

4. Options.isometric_weight (default 0) controls the heuristic weight.
   to_isometric() defaults it to 8 when unset — dominant over typical
   curves scores (3-6) and islands_weight (5), but contributes 0 when
   no pattern is detected, leaving non-matching regions to standard
   heuristics.

5. to_isometric() respects the user's optimize setting instead of
   forcing it to true. The isometric crossing-edge heuristic works
   regardless of whether optimization is enabled.

6. CLI --isometric / -I option in the tracer binary.

7. Four isometric test fixture PNGs and updated sanitize.sh to cover
   the new -I output mode with AddressSanitizer.

All changes are backward-compatible: isometric_weight defaults to 0 and
the isometric optimization flag defaults to false, so existing methods
(to_voronoi, to_grouped_voronoi, to_splines) produce bit-for-bit
identical output.
```

---

## GitLab Merge Request

### Title
```
Add region-adaptive isometric pixel art vectorization
```

### Description
```
## Summary

- Add `to_isometric()` output method with rotation-invariant, region-adaptive heuristic for isometric pixel art
- Detect three pattern families per crossing-diagonal site: 2:1 horizontal staircase, 1:2 vertical staircase, 1:1 diagonal continuation
- Add multi-step confirmation to reduce false positives
- Add extended border slope validator for the optimization pass (slopes 2 and 0.5)
- Fix stale prev/next bug in optimize() border skip (prevents spike artifacts)
- Respect user's optimize setting in to_isometric() instead of forcing it
- Add `--isometric` / `-I` CLI option to the tracer binary
- Add 4 isometric test fixtures and update sanitize.sh

## Motivation

Isometric pixel art sprites face multiple directions within the isometric projection plane. A single image contains regions with fundamentally different pixel art properties:

- **Side-facing surfaces**: 2:1 dimetric staircase patterns (~26.565°)
- **Top/bottom surfaces**: 1:2 vertical staircase patterns
- **Forward-facing surfaces**: standard pixel art — vertical/horizontal lines, 1:1 diagonals
- **Rounded elements**: curved transitions mixing all pattern types

The existing `curves` heuristic underperforms on 2:1 staircases because pixels typically have `adjsize() > 2`, so chain-following stops early. A uniform 2:1 boost would harm forward-facing regions. The algorithm must be **region-adaptive**.

## Approach

### Region-adaptive isometric heuristic (`depixelize.cpp`)

A new heuristic in `_remove_crossing_edges_unsafe()` detects three pattern families at each crossing-diagonal site. For a diagonal a→b with displacement (dx,dy):

**Path 1: 2:1 horizontal staircase**
```
  H ← A         A → H
     ↘              ↙
       B              B
         → J    J ←
```
H=(ax-dx,ay) connected to a, J=(bx+dx,by) connected to b. Multi-step checks diagonal predecessor from H and successor from J.

**Path 2: 1:2 vertical staircase** — analogous with vertical neighbors V_a and V_b.

**Path 3: 1:1 diagonal continuation** — predecessor `diag_adj(*a,-dx,-dy)` and successor `diag_adj(*b,dx,dy)`.

Each path: +1 single-step, +1 multi-step. Score range 0–6, multiplied by `isometric_weight` (default 8).

### Splintering fix (`optimization.h`)

The `optimize()` function had a bug: after `border_detection()` returns `skip > 0`, the loop advanced `j` but fell through to the optimization loop with stale `prev`/`next` references. Fix: `continue` after skip to lock ALL border points.

### Extended border slope validation (`optimization.h`)

Added `is_valid_border_m_isometric()` recognizing slopes 2 and 0.5 alongside standard slopes (∞, 3, 1). Threaded through the call chain via `bool isometric = false` defaults.

### `to_isometric()` respects optimize setting

Removed forced `optimize = true`. The isometric heuristic works at the crossing-edge resolution stage, independent of the optimization pass.

### Backward compatibility

All changes gated by defaults:
- `Options::isometric_weight` defaults to 0
- `bool isometric` defaults to `false` throughout optimization chain
- Existing methods produce bit-for-bit identical output

## Test plan

- [ ] `test/sanitize.sh` passes with AddressSanitizer (all 13 images × 5 output modes including `-I`)
- [ ] Existing output modes (`-v`, `-g`, `-n`, default) produce identical results
- [ ] `--isometric` produces smooth vectorized output for isometric test fixtures
- [ ] Verify with isometric sprites: clean diagonal lines, no splintering artifacts, no opacity halos
- [ ] Verify forward-facing regions in isometric sprites maintain standard pixel art quality
```
