# Upstream PR/Commit Metadata for libdepixelize Isometric Patch

## Git Commit

### Title
```
Add isometric pixel art vectorization method (to_isometric)
```

### Body
```
Add a new to_isometric() output method optimized for isometric pixel art
using 2:1 dimetric projection (~26.565° diagonals).

Isometric pixel art (Habbo Hotel, retro simulation games) uses
characteristic 2:1 staircase patterns: 2 pixels horizontal, 1 pixel
vertical per step. The standard Kopf-Lischinski curves heuristic
underperforms on these patterns because pixels in 2:1 staircases
typically have adjsize() > 2, causing chain-following to stop early.

This commit adds:

1. A new "isometric diagonals" heuristic in _remove_crossing_edges_unsafe()
   that detects when a diagonal connection is part of a 2:1 or 1:2
   staircase pattern. For each diagonal a→b in a 2x2 crossing block, it
   checks whether both endpoints have connected cardinal neighbors on the
   side away from the diagonal — confirming the pixel is part of a 2-wide
   (or 2-tall) step. The heuristic uses adj fields (graph connectivity
   post-disconnect) rather than recomputing similar_colors.

2. An extended border slope validator (is_valid_border_m_isometric) for
   the optimization pass that additionally recognizes slopes 2 and 0.5
   (the 2:1 and 1:2 dimetric angles), preventing the Kopf-Lischinski
   path relaxation from distorting straight isometric diagonal lines.
   This is threaded through the optimize() call chain via a bool
   isometric=false default parameter, so existing methods are unaffected.

3. Options.isometric_weight (default 0) controls the heuristic weight.
   to_isometric() defaults it to 8 when unset — dominant over typical
   curves scores (3-6) and islands_weight (5), but contributes 0 when
   no staircase is detected, leaving non-staircase regions to other
   heuristics.

4. to_isometric() uses the full smoothing pipeline: SimplifiedVoronoi
   with adjust_splines=true, HomogeneousSplines polygon merging, and
   Splines construction with optimization always enabled. This produces
   clean B-spline curves and lines from the pixel staircases.

5. CLI --isometric / -I option in the tracer binary.

6. Four isometric test fixture PNGs (Habbo Hotel sprites) and updated
   sanitize.sh to cover the new -I output mode with AddressSanitizer.

All changes are backward-compatible: isometric_weight defaults to 0 and
the isometric optimization flag defaults to false, so existing methods
(to_voronoi, to_grouped_voronoi, to_splines) produce bit-for-bit
identical output.
```

---

## GitLab Merge Request

### Title
```
Add isometric pixel art vectorization method
```

### Description
```
## Summary

- Add `to_isometric()` output method optimized for isometric pixel art using 2:1 dimetric projection (~26.565° diagonals)
- Add isometric diagonal staircase heuristic for crossing-edge resolution
- Add extended border slope validator for the optimization pass (slopes 2 and 0.5)
- Add `--isometric` / `-I` CLI option to the tracer binary
- Add 4 isometric test fixtures and update sanitize.sh

## Motivation

Isometric pixel art (Habbo Hotel, retro simulation games) uses characteristic 2:1 staircase patterns: 2 pixels horizontal, 1 pixel vertical per step. The existing Kopf-Lischinski `curves` heuristic underperforms on these because pixels in 2:1 staircases typically have `adjsize() > 2`, so chain-following stops early and gives low scores. This causes the algorithm to inconsistently resolve crossing diagonals, producing distorted vectorization of isometric content.

## Approach

### Isometric diagonal heuristic (`depixelize.cpp`)

A new heuristic in `_remove_crossing_edges_unsafe()` detects 2:1 and 1:2 staircase patterns at crossing-diagonal sites. For a diagonal a→b in a 2×2 crossing block:

```
  [H]←A | B       H = A's horizontal neighbor away from diagonal
     ---+---       J = D's horizontal neighbor away from diagonal
       C | D→[J]   If both H,J exist and are connected → 2:1 step
```

The heuristic checks whether both endpoints have connected cardinal neighbors on the side **away** from the diagonal, confirming the pixel is part of a 2-wide step. Uses `adj` fields (post-disconnect connectivity) rather than recomputing `similar_colors`.

Weight of 8 (via `Options::isometric_weight`) is dominant over typical curves scores (3–6) and `islands_weight` (5), but contributes 0 when no staircase is detected.

### Extended border slope validation (`optimization.h`)

Added `is_valid_border_m_isometric()` alongside the existing `is_valid_border_m()`. It additionally recognizes slopes 2 and 0.5 (the 2:1 and 1:2 dimetric angles) so the Kopf-Lischinski path relaxation preserves straight isometric diagonal lines instead of distorting them.

Threaded through `is_border()` → `border_detection()` → `optimize()` → `worker_helper()` → `worker()` → `Splines()` constructor via a `bool isometric = false` default parameter. All existing callers are unaffected.

### `to_isometric()` function (`depixelize.cpp`)

Uses the full smoothing pipeline:
1. `SimplifiedVoronoi` with `adjust_splines=true` — B-spline-ready vertex positions
2. `HomogeneousSplines` — same-color polygon merging
3. `Splines` with optimization **always on** and `isometric=true` — path relaxation with extended border slopes

### Backward compatibility

All changes are gated:
- `Options::isometric_weight` defaults to 0 — the heuristic contributes nothing unless explicitly enabled
- `bool isometric` defaults to `false` throughout the optimization chain
- Existing `to_voronoi()`, `to_grouped_voronoi()`, `to_splines()` produce bit-for-bit identical output

## Test plan

- [ ] `test/sanitize.sh` passes with AddressSanitizer (all 13 images × 5 output modes including `-I`)
- [ ] Existing output modes (`-v`, `-g`, `-n`, default) produce identical results
- [ ] `--isometric` produces smooth vectorized output for isometric test fixtures
- [ ] Verify with Habbo Hotel sprites: clean diagonal lines at ~26.565°, no jagged staircases
```
