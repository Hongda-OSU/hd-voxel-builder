import { describe, expect, it } from "vitest";
import { buildModel } from "../core/buildModel";
import type { Part, VoxelSpec } from "../core/types";
import { DEFAULT_CAMERA, VIEW_PRESETS, extractFaces, makeProjector, toCamera, visibleFaces } from "./viewport";
import type { Camera, Vec3 } from "./viewport";

function grid(parts: Part[], size: VoxelSpec["size"] = [4, 4, 4]) {
  return buildModel({ name: "t", style: "object", size, palette: { A: "#808080" }, parts });
}

const camera = (yaw: number, pitch: number): Camera => ({ ...DEFAULT_CAMERA, yaw, pitch });
const UP: Vec3 = [0, 1, 0];
const FRONT: Vec3 = [0, 0, 1];
const BACK: Vec3 = [0, 0, -1];
const RIGHT: Vec3 = [1, 0, 0];

describe("extractFaces", () => {
  it("exposes six faces for a lone voxel and hides shared faces", () => {
    expect(extractFaces(grid([{ name: "a", color: "A", cells: [[1, 1, 1]] }]))).toHaveLength(6);
    expect(extractFaces(grid([{ name: "a", color: "A", cells: [[1, 1, 1], [2, 1, 1]] }]))).toHaveLength(10);
  });

  it("exposes the cut layer's top when clipping with maxH", () => {
    const column = grid([{ name: "a", color: "A", boxes: [[1, 1, 0, 2, 1, 1]] }]);
    expect(extractFaces(column)).toHaveLength(14);
    const clipped = extractFaces(column, { revealUpTo: null, maxH: 0 });
    expect(clipped).toHaveLength(6);
    expect(clipped.some((f) => f.normal[1] === 1 && f.center[1] === 1)).toBe(true);
  });

  it("hides later parts with revealUpTo", () => {
    const g = grid([
      { name: "a", color: "A", cells: [[0, 0, 0]] },
      { name: "b", color: "A", cells: [[3, 3, 3]] },
    ]);
    expect(extractFaces(g, { revealUpTo: 0, maxH: null }).every((f) => f.part === 0)).toBe(true);
  });

  it("darkens faces with occluding neighbours", () => {
    const lone = extractFaces(grid([{ name: "a", color: "A", cells: [[1, 0, 1]] }]));
    const walled = extractFaces(grid([{ name: "a", color: "A", cells: [[1, 0, 1], [2, 1, 1]] }]));
    const top = (faces: ReturnType<typeof extractFaces>) =>
      faces.find((f) => f.normal[1] === 1 && f.center[0] === 1.5)?.brightness ?? 0;
    expect(top(walled)).toBeLessThan(top(lone));
  });

  it("lights the top brightest", () => {
    const faces = extractFaces(grid([{ name: "a", color: "A", cells: [[1, 1, 1]] }]));
    const top = faces.find((f) => f.normal[1] === 1)!.brightness;
    expect(faces.every((f) => f.brightness <= top)).toBe(true);
  });
});

describe("makeProjector", () => {
  it("faces the front at the front preset and the top at the top preset", () => {
    const front = makeProjector([4, 4, 4], camera(VIEW_PRESETS.front.yaw, VIEW_PRESETS.front.pitch), 100, 100);
    expect(front.facing(FRONT)).toBeGreaterThan(0.99);
    expect(front.facing(BACK)).toBeLessThan(0);
    expect(front.facing(UP)).toBeCloseTo(0);
    const top = makeProjector([4, 4, 4], camera(VIEW_PRESETS.top.yaw, VIEW_PRESETS.top.pitch), 100, 100);
    expect(top.facing(UP)).toBeGreaterThan(0.99);
  });

  it("faces +x from the right preset", () => {
    const right = makeProjector([4, 4, 4], camera(VIEW_PRESETS.right.yaw, VIEW_PRESETS.right.pitch), 100, 100);
    expect(right.facing(RIGHT)).toBeGreaterThan(0.99);
  });

  it("shows top, front and right in the default three-quarter view", () => {
    const p = makeProjector([4, 4, 4], DEFAULT_CAMERA, 100, 100);
    for (const n of [UP, FRONT, RIGHT]) expect(p.facing(n)).toBeGreaterThan(0);
  });

  it("centres the canvas box and keeps it inside the view at zoom 1", () => {
    for (const cam of [DEFAULT_CAMERA, camera(1.2, 0.3), camera(-2.5, 1.5)]) {
      const p = makeProjector([18, 12, 28], cam, 600, 400);
      const [cx, cy] = p.project([9, 14, 6]);
      expect(cx).toBeCloseTo(300);
      expect(cy).toBeCloseTo(200);
      for (const x of [0, 18]) for (const h of [0, 28]) for (const d of [0, 12]) {
        const [sx, sy] = p.project([x, h, d]);
        expect(sx).toBeGreaterThanOrEqual(0);
        expect(sx).toBeLessThanOrEqual(600);
        expect(sy).toBeGreaterThanOrEqual(0);
        expect(sy).toBeLessThanOrEqual(400);
      }
    }
  });

  it("draws +h upward and the front toward the bottom when looking down", () => {
    const p = makeProjector([4, 4, 4], DEFAULT_CAMERA, 100, 100);
    expect(p.project([2, 3, 2])[1]).toBeLessThan(p.project([2, 1, 2])[1]);
    // From the top, the front points down the screen (negative up).
    expect(toCamera(VIEW_PRESETS.top, FRONT)[1]).toBeLessThan(-0.99);
  });
});

describe("visibleFaces", () => {
  it("culls back faces and sorts far to near", () => {
    const g = grid([{ name: "a", color: "A", boxes: [[0, 3, 0, 1, 0, 3]] }]);
    const p = makeProjector(g.size, DEFAULT_CAMERA, 200, 200);
    const faces = visibleFaces(extractFaces(g), p);
    expect(faces.every((f) => p.facing(f.normal) > 0)).toBe(true);
    const depths = faces.map((f) => p.project(f.center)[2]);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });
});
