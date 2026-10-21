import { voxelAt } from "./buildModel";
import { DEFAULT_GROUP } from "./types";
import type { VoxelGrid, VoxelSpec } from "./types";

const VERSION = 150;
const CHUNK_HEADER = 12;
const RGBA_BYTES = 256 * 4;

/**
 * Serializes a grid as a MagicaVoxel .vox file, optionally only one export
 * group. Palette indices follow the spec's palette key order, starting at 1.
 */
export function writeVox(spec: VoxelSpec, grid: VoxelGrid, group?: string): Uint8Array {
  const [w, depth, height] = grid.size;
  const paletteIndex = new Map(Object.keys(spec.palette).map((key, i) => [key, i + 1]));

  const voxels: number[] = [];
  for (let x = 0; x < w; x++) {
    for (let h = 0; h < height; h++) {
      for (let d = 0; d < depth; d++) {
        const voxel = voxelAt(grid, x, h, d);
        if (!voxel) continue;
        if (group !== undefined && (spec.parts[voxel.part]?.group ?? DEFAULT_GROUP) !== group) continue;
        const color = paletteIndex.get(voxel.color);
        if (color === undefined) continue;
        // MagicaVoxel is Z-up (X = x, Y = d, Z = h). Rotating 180° around Z
        // puts the front, max d, toward its default camera.
        voxels.push(w - 1 - x, depth - 1 - d, h, color);
      }
    }
  }

  const sizeBytes = 12;
  const xyziBytes = 4 + voxels.length;
  const children = 3 * CHUNK_HEADER + sizeBytes + xyziBytes + RGBA_BYTES;
  const out = new Uint8Array(8 + CHUNK_HEADER + children);
  const view = new DataView(out.buffer);
  let at = 0;
  const id = (text: string) => {
    for (const ch of text) out[at++] = ch.charCodeAt(0);
  };
  const int = (n: number) => {
    view.setInt32(at, n, true);
    at += 4;
  };
  const chunk = (name: string, content: number, childBytes = 0) => {
    id(name);
    int(content);
    int(childBytes);
  };

  id("VOX ");
  int(VERSION);
  chunk("MAIN", 0, children);
  chunk("SIZE", sizeBytes);
  int(w);
  int(depth);
  int(height);
  chunk("XYZI", xyziBytes);
  int(voxels.length / 4);
  out.set(voxels, at);
  at += voxels.length;
  chunk("RGBA", RGBA_BYTES);
  // Palette index i lives in RGBA slot i - 1.
  for (const [key, i] of paletteIndex) {
    const hex = spec.palette[key] ?? "#000000";
    const slot = at + (i - 1) * 4;
    out[slot] = parseInt(hex.slice(1, 3), 16);
    out[slot + 1] = parseInt(hex.slice(3, 5), 16);
    out[slot + 2] = parseInt(hex.slice(5, 7), 16);
    out[slot + 3] = 255;
  }
  return out;
}
