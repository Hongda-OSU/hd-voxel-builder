import { describe, expect, it } from "vitest";
import { buildModel } from "../core/buildModel";
import type { VoxelSpec } from "../core/types";
import { fitView, project, rotateFloor, shade, viewVoxels } from "./iso";
import type { Rotation } from "./iso";

const spec: VoxelSpec = {
  name: "test",
  style: "object",
  size: [4, 3, 5],
  palette: { A: "#808080", B: "#ffffff" },
  parts: [
    { name: "floor", color: "A", boxes: [[0, 3, 0, 0, 0, 2]] },
    { name: "nose", color: "B", cells: [[1, 1, 2]] },
  ],
};

describe("rotateFloor", () => {
  it("returns to the start after four quarter turns", () => {
    let [x, z, w, d] = [1, 2, 4, 3];
    for (let i = 0; i < 4; i++) {
      [x, z] = rotateFloor(x, z, w, d, 1);
      [w, d] = [d, w];
    }
    expect([x, z]).toEqual([1, 2]);
  });

  it("composes single turns", () => {
    const twice = rotateFloor(...rotateFloor(1, 2, 4, 3, 1), 3, 4, 1);
    expect(rotateFloor(1, 2, 4, 3, 2)).toEqual(twice);
  });

  it("turns the front (max d) away from the camera after one turn", () => {
    // The camera sees view +x and +z; the front row lands on view x = 0.
    expect(rotateFloor(0, 2, 4, 3, 1)).toEqual([0, 0]);
    expect(rotateFloor(3, 0, 4, 3, 1)).toEqual([2, 3]);
  });
});

describe("viewVoxels", () => {
  const grid = buildModel(spec);

  it("keeps coordinates without rotation and swaps floor extents on odd turns", () => {
    const flat = viewVoxels(grid, 0);
    expect(flat.voxels).toContainEqual({ x: 1, y: 1, z: 2, color: "B", part: 1 });
    expect([flat.w, flat.depth, flat.height]).toEqual([4, 3, 5]);
    const turned = viewVoxels(grid, 1);
    expect([turned.w, turned.depth, turned.height]).toEqual([3, 4, 5]);
    expect(turned.voxels).toHaveLength(flat.voxels.length);
  });

  it("sorts back to front", () => {
    for (const rotation of [0, 1, 2, 3] as Rotation[]) {
      const sums = viewVoxels(grid, rotation).voxels.map((v) => v.x + v.y + v.z);
      expect(sums).toEqual([...sums].sort((a, b) => a - b));
    }
  });

  it("hides parts after revealUpTo", () => {
    expect(viewVoxels(grid, 0, 0).voxels.every((v) => v.part === 0)).toBe(true);
    expect(viewVoxels(grid, 0, 0).voxels).toHaveLength(12);
  });
});

describe("fitView", () => {
  it("keeps every corner of the canvas box inside the drawing area", () => {
    for (const view of [{ w: 18, depth: 12, height: 28 }, { w: 64, depth: 64, height: 4 }]) {
      const fit = fitView(view, 600, 400);
      for (const x of [0, view.w]) {
        for (const y of [0, view.height]) {
          for (const z of [0, view.depth]) {
            const [px, py] = project(fit, x, y, z);
            expect(px).toBeGreaterThanOrEqual(0);
            expect(px).toBeLessThanOrEqual(600);
            expect(py).toBeGreaterThanOrEqual(0);
            expect(py).toBeLessThanOrEqual(400);
          }
        }
      }
    }
  });
});

describe("shade", () => {
  it("scales channels and clamps at 255", () => {
    expect(shade("#808080", 0.5)).toBe("rgb(64,64,64)");
    expect(shade("#f0f0f0", 2)).toBe("rgb(255,255,255)");
  });
});
