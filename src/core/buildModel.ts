import type { Cell, Part, Voxel, VoxelGrid, VoxelSpec } from "./types";

export function cellIndex(size: VoxelGrid["size"], x: number, h: number, d: number): number {
  const [w, depth] = size;
  return x + w * (d + depth * h);
}

export function inBounds(size: VoxelGrid["size"], x: number, h: number, d: number): boolean {
  const [w, depth, height] = size;
  return x >= 0 && x < w && d >= 0 && d < depth && h >= 0 && h < height;
}

export function voxelAt(grid: VoxelGrid, x: number, h: number, d: number): Voxel | undefined {
  return inBounds(grid.size, x, h, d) ? grid.cells[cellIndex(grid.size, x, h, d)] : undefined;
}

/** Every cell a part covers, mirrored copies included; may fall outside the canvas. */
export function* partCells(part: Part, width: number): Generator<Cell> {
  for (const cell of ownCells(part)) {
    yield cell;
    if (part.mirrorX) yield [width - 1 - cell[0], cell[1], cell[2]];
  }
}

function* ownCells(part: Part): Generator<Cell> {
  for (const [x0, x1, h0, h1, d0, d1] of part.boxes ?? []) {
    for (let x = x0; x <= x1; x++) {
      for (let h = h0; h <= h1; h++) {
        for (let d = d0; d <= d1; d++) {
          const ex = x === x0 || x === x1;
          const eh = h === h0 || h === h1;
          const ed = d === d0 || d === d1;
          if (part.chamfer === "all" && Number(ex) + Number(eh) + Number(ed) >= 2) continue;
          if (part.chamfer === "v" && ex && ed) continue;
          yield [x, h, d];
        }
      }
    }
  }
  yield* part.cells ?? [];
  if (part.sphere) {
    const { x: cx, h: ch, d: cd, r } = part.sphere;
    for (let x = Math.ceil(cx - r); x <= Math.floor(cx + r); x++) {
      for (let h = Math.ceil(ch - r); h <= Math.floor(ch + r); h++) {
        for (let d = Math.ceil(cd - r); d <= Math.floor(cd + r); d++) {
          if ((x - cx) ** 2 + (h - ch) ** 2 + (d - cd) ** 2 <= r * r) yield [x, h, d];
        }
      }
    }
  }
}

/** Applies parts in order; cells outside the canvas are clipped. */
export function buildModel(spec: VoxelSpec): VoxelGrid {
  const [w, depth, height] = spec.size;
  const grid: VoxelGrid = {
    size: spec.size,
    cells: new Array<Voxel | undefined>(w * depth * height).fill(undefined),
    writes: spec.parts.map(() => 0),
  };
  spec.parts.forEach((part, index) => {
    // A mirrored cell on the centre line comes twice; count it once.
    const written = new Set<number>();
    for (const [x, h, d] of partCells(part, w)) {
      if (!inBounds(grid.size, x, h, d)) continue;
      const i = cellIndex(grid.size, x, h, d);
      if (part.paint && !grid.cells[i]) continue;
      grid.cells[i] = { color: part.color, part: index };
      written.add(i);
    }
    grid.writes[index] = written.size;
  });
  return grid;
}
