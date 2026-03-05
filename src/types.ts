export interface DepixelizeOptions {
  curvesMultiplier: number;
  islandsWeight: number;
  sparsePixelsMultiplier: number;
  sparsePixelsRadius: number;
  optimize: boolean;
  method: 'splines' | 'voronoi' | 'grouped_voronoi';
}

export interface DepixelizeResult {
  svg: string;
  width: number;
  height: number;
  processingTimeMs: number;
}

export interface BatchOptions {
  /** Maximum number of concurrent workers. Default: navigator.hardwareConcurrency || 4 */
  maxConcurrency?: number;
  /** Maximum total memory budget in MB for worker pool. Default: 512 */
  maxMemoryMB?: number;
  /** Progress callback invoked after each image completes. */
  onProgress?: (completed: number, total: number) => void;
}

export interface DepixelizeBatchResult {
  /** Results in the same order as the input items. */
  results: DepixelizeResult[];
  /** Total wall-clock time for the entire batch in milliseconds. */
  totalTimeMs: number;
}

/** Default options aligned with Inkscape's Trace Bitmap dialog. */
export const DEFAULT_OPTIONS: DepixelizeOptions = {
  /** Weight for curves heuristic (Inkscape default: 1) */
  curvesMultiplier: 1.0,
  /** Weight for islands heuristic (Inkscape default: 5, C++ default: 5) */
  islandsWeight: 5,
  /** Weight for sparse pixels heuristic (Inkscape default: 1) */
  sparsePixelsMultiplier: 1.0,
  /** Radius for sparse pixel detection (Inkscape default: 4) */
  sparsePixelsRadius: 4,
  /** Kopf-Lischinski path optimization (Inkscape default: unchecked) */
  optimize: false,
  /** Vectorization method (Inkscape default: Voronoi) */
  method: 'voronoi',
};
