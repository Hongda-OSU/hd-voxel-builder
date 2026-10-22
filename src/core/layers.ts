import { voxelAt } from "./buildModel";
import type { VoxelGrid } from "./types";

export interface LayerPart {
  /** Index into spec.parts. */
  part: number;
  voxels: number;
}

/** Parts owning voxels at height h, in build order, with their voxel counts. */
export function layerParts(grid: VoxelGrid, h: number): LayerPart[] {
  const [w, depth] = grid.size;
  const counts = new Map<number, number>();
  for (let x = 0; x < w; x++) {
    for (let d = 0; d < depth; d++) {
      const voxel = voxelAt(grid, x, h, d);
      if (voxel) counts.set(voxel.part, (counts.get(voxel.part) ?? 0) + 1);
    }
  }
  return [...counts]
    .sort(([a], [b]) => a - b)
    .map(([part, voxels]) => ({ part, voxels }));
}
