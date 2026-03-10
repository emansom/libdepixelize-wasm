# Isometric Pixel Art Vectorization — Research & Design

## A. Isometric Pixel Art Geometry

### True Isometric vs Dimetric Projection

**True isometric projection** places the camera at equal 120° angles between all three axes, yielding 30° lines to horizontal and a camera tilt of ~35.264° (arctan(√2)). Each axis has identical foreshortening (factor ~0.8165).

**Dimetric projection** (used by virtually all "isometric" games) uses a **2:1 pixel ratio**: 2 pixels horizontal for every 1 pixel vertical per staircase step. This produces lines at ~26.565° (arctan(0.5)) — not true 30°. Two of the three axes share the same foreshortening; the third (typically vertical) differs.

### Pixel Ratios and Angles

| Ratio | Angle | Usage |
|-------|-------|-------|
| 2:1 | ~26.565° (arctan 0.5) | Standard "isometric" games (Habbo Hotel, SimCity 2000, Diablo) |
| 1:1 | 45° | Standard pixel art diagonal |
| 1:2 | ~63.435° (arctan 2) | Vertical 2:1 (rotated) |
| 4:1 | ~14.036° | Shallow angles (some backgrounds) |
| 3:1 | ~18.435° | Rare; some architectural details |

### Grid Properties

- **Diamond-shaped tile**: tiles are rotated 45° from screen axes
- **8 mathematical orientations**: N, NE, E, SE, S, SW, W, NW (compass directions in the isometric plane)
- **Mode 0** (non-square pixels): some retro hardware used non-square pixel aspect ratios, producing visually correct isometric angles from non-2:1 staircase patterns
- **Mode 1** (square pixels): modern standard; 2:1 ratio produces ~26.565°

## B. Horizontal Rotation in Isometric Sprites

### The heterogeneity insight

Isometric sprites face **4 or 8 directions** within the isometric horizontal plane. A single sprite (or scene) therefore contains regions with fundamentally different pixel art properties:

| Sprite direction | Surface type | Pixel pattern |
|-----------------|--------------|---------------|
| Side-facing | Isometric X/Z-axis | 2:1 horizontal staircase |
| Top/bottom | Isometric Y-axis | 1:2 vertical staircase |
| Forward-facing (toward camera) | Normal pixel art | Vertical/horizontal lines, 1:1 diagonals |
| Rounded elements (heads, wheels) | Mixed curvature | Transitions between all pattern types |

**Key insight**: A single image is heterogeneous — the algorithm cannot assume uniform 2:1 properties across the entire image. It must be **region-adaptive**, choosing the correct heuristic at each crossing-diagonal site based on local pixel connectivity.

### Implications for Algorithm Design

1. **No global mode switch**: Cannot simply boost all 2:1 diagonals uniformly
2. **Per-site detection**: Each 2×2 crossing block must independently determine which pattern family its diagonal belongs to
3. **Graceful degradation**: Where no isometric pattern is detected, the standard Kopf-Lischinski heuristics must prevail
4. **Forward-facing regions**: 1:1 diagonal continuations must also receive appropriate weight, not just 2:1/1:2

## C. How Kopf-Lischinski Handles Crossing Diagonals

The core of the algorithm resolves **crossing edges** in 2×2 pixel blocks where both diagonals are connected (same-color pixels):

```
A | B
--+--
C | D
```

Both A↔D (main diagonal) and B↔C (secondary diagonal) connect to same-color pixels. One diagonal must be removed. The algorithm computes a **weight** for each diagonal using multiple heuristics:

1. **Curves** — follow chains of degree-2 nodes; longer chains get higher weight
2. **Islands** — isolated pixels (degree 1) get boosted
3. **Sparse pixels** — local density of similar colors in a radius
4. **Isometric diagonals** (our extension) — staircase pattern detection

The diagonal with higher total weight survives; equal weights remove both.

## D. The Three Heuristic Detection Paths

For a diagonal a→b with displacement (dx, dy) where |dx|=1, |dy|=1:

### Path 1: 2:1 Horizontal Staircase

Checks for same-color cardinal neighbors extending the step horizontally:

```
    H ← A         A → H
       ↘              ↙
         B              B
           → J    J ←
```

- **H** = node at (ax-dx, ay) — a's horizontal neighbor away from b
- **J** = node at (bx+dx, by) — b's horizontal neighbor away from a
- H connected to a via `adj.left`/`adj.right`, J connected to b likewise
- **Multi-step**: Check for a second step: predecessor diagonal from H and/or successor diagonal to J
- Score: +1 for single step, +1 for multi-step confirmation

### Path 2: 1:2 Vertical Staircase

Checks for same-color cardinal neighbors extending the step vertically:

```
    V
    ↓
    A
      ↘
        B
        ↓
        V
```

- **V_a** = node at (ax, ay-dy) — a's vertical neighbor away from b
- **V_b** = node at (bx, by+dy) — b's vertical neighbor away from a
- Connected via `adj.top`/`adj.bottom`
- **Multi-step**: analogous to horizontal
- Score: +1 for single step, +1 for multi-step confirmation

### Path 3: 1:1 Diagonal Continuation (NEW)

Checks for diagonal predecessor/successor in the same direction — standard pixel art 45° diagonal:

```
P
  ↘
    A
      ↘
        B
          ↘
            S
```

- **P** = predecessor: `diag_adj(*a, -dx, -dy)` — diagonal neighbor of a in opposite direction
- **S** = successor: `diag_adj(*b, dx, dy)` — diagonal neighbor of b in same direction
- Score: +1 for each connected end (predecessor, successor)

### Score Range

Combined score: 0–6 (2 per path maximum). Weight multiplied by `isometric_weight` (default 8).

Maximum contribution: 6 × 8 = 48 (very strong signal for a well-confirmed diagonal).
Typical: 1–2 per path = 8–16 (dominant over curves 3–6 and islands 5).

## E. Multi-Step Confirmation

Single-step detection (checking only immediate cardinal neighbors) is too lenient — it triggers on any pixel pair with same-color cardinal neighbors, producing false positives in non-isometric regions.

**Multi-step confirmation** requires that the staircase pattern continues for at least one additional step beyond the immediate neighbors. This is implemented by checking the diagonal adjacency (`diag_adj`) of the cardinal neighbor:

For 2:1 horizontal, after confirming H and J exist:
- Check if H has a diagonal connection in the (-dx, -dy) direction (predecessor step)
- Check if J has a diagonal connection in the (dx, dy) direction (successor step)

Each confirmed step adds +1 to the score (on top of the +1 for single-step detection).

This dramatically reduces false positives while maintaining sensitivity for genuine staircase patterns that span at least 2 steps.

## F. Optimization Slope Validation

The Kopf-Lischinski optimization pass uses random relaxation to smooth B-spline control points. **Border detection** identifies sequences of points forming straight lines that should be preserved (locked) during relaxation.

### Standard Border Slopes

`is_valid_border_m()` recognizes:
- ∞ (vertical lines)
- ±3 (steep diagonals)
- ±1 (45° diagonals)

### Extended Isometric Slopes

`is_valid_border_m_isometric()` additionally recognizes:
- ±2 (2:1 dimetric — the primary isometric angle)
- ±0.5 (1:2 dimetric — the perpendicular isometric angle)

This prevents the optimization from distorting straight isometric diagonal lines while still allowing curved regions to be smoothed.

### Splintering Bug Fix

The optimization pass had a bug where `border_detection()` could skip multiple points (the border sequence), but the last point of the sequence was still subjected to random relaxation with stale `prev`/`next` references computed at the beginning of the loop iteration. Fix: after any skip > 0, `continue` to the next iteration instead of falling through to the optimization loop. This locks ALL border points correctly.

## G. Differences from Research Literature

| Aspect | Kopf-Lischinski (2011) | Our Isometric Extension |
|--------|----------------------|------------------------|
| Target content | General pixel art | Isometric pixel art (heterogeneous scenes) |
| Diagonal patterns | 1:1 only (via curves heuristic) | 2:1, 1:2, and 1:1 (three detection paths) |
| Detection scope | Global chain-following | Per-site local pattern matching |
| Region awareness | Uniform across image | Region-adaptive (each crossing block independently classified) |
| Staircase confirmation | N/A | Multi-step: single +1, multi-step +1 per additional step |
| Optimization slopes | ∞, ±3, ±1 | Additionally ±2, ±0.5 |
| Optimization behavior | User-controlled | User-controlled (no forced override) |
| Weight range | Curves: 1–N, Islands: 0/5 | Isometric: 0–48 (0 when no pattern detected) |

## References

1. Kopf, J. and Lischinski, D. (2011). "Depixelizing Pixel Art." ACM Transactions on Graphics (SIGGRAPH), 30(4), Article 99.
2. libdepixelize source code (Inkscape): https://gitlab.com/inkscape/devel/libdepixelize
3. Pixel art isometric projection conventions: community standards from pixel art forums and game development resources.
