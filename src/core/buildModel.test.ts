import { describe, expect, it } from "vitest";
import { buildModel, voxelAt } from "./buildModel";
import type { Part, VoxelGrid, VoxelSpec } from "./types";

function spec(parts: Part[], size: VoxelSpec["size"] = [8, 8, 8]): VoxelSpec {
  return { name: "test", style: "object", size, palette: { A: "#111111", B: "#222222" }, parts };
}

function count(grid: VoxelGrid): number {
  return grid.cells.filter(Boolean).length;
}

describe("buildModel", () => {
  it("fills inclusive boxes and cells", () => {
    const grid = buildModel(spec([{ name: "a", color: "A", boxes: [[0, 1, 0, 2, 0, 3]], cells: [[7, 7, 7]] }]));
    expect(count(grid)).toBe(2 * 3 * 4 + 1);
    expect(voxelAt(grid, 7, 7, 7)).toEqual({ color: "A", part: 0 });
  });

  it("lets later parts overwrite earlier ones and records provenance", () => {
    const grid = buildModel(spec([
      { name: "a", color: "A", boxes: [[0, 3, 0, 0, 0, 0]] },
      { name: "b", color: "B", cells: [[2, 0, 0]] },
    ]));
    expect(voxelAt(grid, 1, 0, 0)).toEqual({ color: "A", part: 0 });
    expect(voxelAt(grid, 2, 0, 0)).toEqual({ color: "B", part: 1 });
    expect(grid.writes).toEqual([4, 1]);
  });

  it("drops the 12 edges with chamfer all", () => {
    const grid = buildModel(spec([{ name: "a", color: "A", boxes: [[0, 2, 0, 2, 0, 2]], chamfer: "all" }]));
    // A 3x3x3 cube keeps its centre and the six face centres.
    expect(count(grid)).toBe(7);
    expect(voxelAt(grid, 0, 0, 0)).toBeUndefined();
    expect(voxelAt(grid, 1, 1, 0)).toBeDefined();
  });

  it("drops only the 4 vertical edges with chamfer v", () => {
    const grid = buildModel(spec([{ name: "a", color: "A", boxes: [[0, 2, 0, 2, 0, 2]], chamfer: "v" }]));
    expect(count(grid)).toBe(27 - 4 * 3);
    expect(voxelAt(grid, 0, 1, 0)).toBeUndefined();
    expect(voxelAt(grid, 1, 0, 0)).toBeDefined();
  });

  it("mirrors across the width with mirrorX", () => {
    const grid = buildModel(spec([{ name: "a", color: "A", cells: [[1, 0, 0], [3, 0, 0]], mirrorX: true }], [8, 1, 1]));
    expect(grid.cells.map((v) => (v ? 1 : 0))).toEqual([0, 1, 0, 1, 1, 0, 1, 0]);
    expect(grid.writes).toEqual([4]);
  });

  it("counts a centre-line cell once when mirrored", () => {
    const grid = buildModel(spec([{ name: "a", color: "A", cells: [[2, 0, 0]], mirrorX: true }], [5, 1, 1]));
    expect(grid.writes).toEqual([1]);
  });

  it("builds spheres with fractional radii", () => {
    const grid = buildModel(spec([{ name: "ball", color: "A", sphere: { x: 3, h: 3, d: 3, r: 1 } }]));
    expect(count(grid)).toBe(7);
    const big = buildModel(spec([{ name: "ball", color: "A", sphere: { x: 7, h: 7, d: 7, r: 2.6 } }], [16, 16, 16]));
    expect(count(big)).toBe(81);
  });

  it("only recolors existing voxels with paint", () => {
    const grid = buildModel(spec([
      { name: "a", color: "A", cells: [[0, 0, 0]] },
      { name: "p", color: "B", boxes: [[0, 1, 0, 0, 0, 0]], paint: true },
    ]));
    expect(voxelAt(grid, 0, 0, 0)).toEqual({ color: "B", part: 1 });
    expect(voxelAt(grid, 1, 0, 0)).toBeUndefined();
    expect(grid.writes).toEqual([1, 1]);
  });

  it("clips cells outside the canvas", () => {
    const grid = buildModel(spec([{ name: "a", color: "A", boxes: [[-2, 9, 0, 0, 0, 0]] }]));
    expect(count(grid)).toBe(8);
    expect(grid.writes).toEqual([8]);
  });
});
