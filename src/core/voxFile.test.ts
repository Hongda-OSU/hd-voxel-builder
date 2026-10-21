import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import hd from "../prompts/examples/hd.json";
import { buildModel } from "./buildModel";
import { validateSpec } from "./spec";
import type { VoxelSpec } from "./types";
import { writeVox } from "./voxFile";

// Reference files written by the original build_vox.py and checked in
// MagicaVoxel 0.99.4.2 for orientation and colors on 2026-10-14.
const reference = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url));

describe("writeVox", () => {
  const { spec } = validateSpec(hd);
  if (!spec) throw new Error("invalid fixture");
  const grid = buildModel(spec);

  it.each([
    [undefined, "hd-full.vox"],
    ["body", "hd-body.vox"],
    ["arm", "hd-arm.vox"],
    ["ball", "hd-ball.vox"],
  ])("matches the verified avatar export for group %s", (group, file) => {
    expect(Buffer.from(writeVox(spec, grid, group))).toEqual(reference(file));
  });

  it("writes the header, axes and palette", () => {
    const small: VoxelSpec = {
      name: "one",
      style: "object",
      size: [2, 3, 4],
      palette: { A: "#102030", B: "#405060" },
      parts: [{ name: "b", color: "B", cells: [[0, 1, 0]] }],
    };
    const bytes = writeVox(small, buildModel(small));
    const view = new DataView(bytes.buffer);
    const text = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

    expect(text(0)).toBe("VOX ");
    expect(view.getInt32(4, true)).toBe(150);
    expect(text(8)).toBe("MAIN");
    expect(text(20)).toBe("SIZE");
    expect([view.getInt32(32, true), view.getInt32(36, true), view.getInt32(40, true)]).toEqual([2, 3, 4]);
    expect(text(44)).toBe("XYZI");
    expect(view.getInt32(56, true)).toBe(1);
    // x = 0 -> X = 1, d = 0 -> Y = 2, h = 1 -> Z = 1, color B = index 2.
    expect([...bytes.subarray(60, 64)]).toEqual([1, 2, 1, 2]);
    expect(text(64)).toBe("RGBA");
    expect([...bytes.subarray(76 + 4, 76 + 8)]).toEqual([0x40, 0x50, 0x60, 255]);
    expect(bytes.length).toBe(76 + 1024);
  });
});
