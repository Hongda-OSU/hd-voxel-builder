import { describe, expect, it } from "vitest";
import hd from "../prompts/examples/hd.json";
import { buildModel } from "./buildModel";
import { layerParts } from "./layers";
import { validateSpec } from "./spec";

describe("layerParts", () => {
  const { spec } = validateSpec(hd);
  if (!spec) throw new Error("invalid fixture");
  const grid = buildModel(spec);
  const named = (h: number) => layerParts(grid, h).map(({ part, voxels }) => [spec.parts[part]?.name, voxels]);

  it("counts the avatar's eye layer by part in build order", () => {
    expect(named(16)).toEqual([
      ["头", 92],
      ["后脑和鬓角", 46],
      ["AirPods", 2],
      ["眼睛", 2],
    ]);
  });

  it("returns nothing outside the model", () => {
    expect(layerParts(grid, 40)).toEqual([]);
    expect(layerParts(grid, -1)).toEqual([]);
  });
});
