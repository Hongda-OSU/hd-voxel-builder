// The build language Claude writes. Field details follow the generation
// contract; keep this file, src/prompts/tool.json and spec.ts in sync.

export type Style = "chibi" | "object" | "diorama";

/** [x0, x1, h0, h1, d0, d1], inclusive. */
export type Box = [number, number, number, number, number, number];

/** [x, h, d]. */
export type Cell = [number, number, number];

export interface Sphere {
  x: number;
  h: number;
  d: number;
  r: number;
}

/** "all" drops each box's 12 edges, "v" only its 4 vertical edges. */
export type Chamfer = "all" | "v";

export interface Part {
  /** Unique and stable; edits locate parts by name. */
  name: string;
  /** A key of the spec's palette. */
  color: string;
  boxes?: Box[];
  cells?: Cell[];
  sphere?: Sphere;
  chamfer?: Chamfer;
  /** Also place a copy mirrored across the width: x' = w - 1 - x. */
  mirrorX?: boolean;
  /** Recolor existing voxels only; never add new ones. */
  paint?: boolean;
  /** Export group for parts animated on their own; defaults to "body". */
  group?: string;
}

export interface VoxelSpec {
  name: string;
  style: Style;
  /** [w, d, h]: width, depth, height. The front faces the largest d. */
  size: [number, number, number];
  /** Palette key to "#rrggbb"; key order sets the .vox palette order. */
  palette: Record<string, string>;
  /** Applied in order; later parts overwrite earlier ones. */
  parts: Part[];
}

export const DEFAULT_GROUP = "body";

export interface Voxel {
  /** Palette key. */
  color: string;
  /** Index into spec.parts of the part that last wrote this voxel. */
  part: number;
}

export interface VoxelGrid {
  size: [number, number, number];
  /** Indexed by x + w * (d + depth * h); empty cells are undefined. */
  cells: (Voxel | undefined)[];
  /** Voxels each part wrote while building, before later overwrites. */
  writes: number[];
}
