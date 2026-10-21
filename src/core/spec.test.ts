import { describe, expect, it } from "vitest";
import hd from "../prompts/examples/hd.json";
import { buildModel } from "./buildModel";
import { checkGrid, validateSpec } from "./spec";

function base(overrides: Record<string, unknown> = {}) {
  return {
    name: "test",
    style: "object",
    size: [8, 8, 8],
    palette: { A: "#111111" },
    parts: [{ name: "a", color: "A", boxes: [[0, 1, 0, 1, 0, 1]] }],
    ...overrides,
  };
}

const messages = (input: unknown) => validateSpec(input).issues.map((i) => i.message);

describe("validateSpec", () => {
  it("accepts the avatar fixture with only the color warning", () => {
    const { spec, issues } = validateSpec(hd);
    expect(spec).not.toBeNull();
    expect(issues).toEqual([
      { level: "warning", kind: "style", message: "style: 14 colors, keep it under 10" },
    ]);
  });

  it("rejects malformed shapes with paths", () => {
    expect(validateSpec("nope")).toEqual({
      spec: null,
      issues: [{ level: "error", kind: "schema", message: "schema: spec must be an object" }],
    });
    const parts = [{ name: "a", color: "A", boxes: [[0, 1, 2, 3, 4]], chamfer: "round", mirrorX: "yes" }];
    expect(messages(base({ size: [8, 0, 8], palette: { A: "red" }, parts }))).toEqual([
      "schema: size must have 3 integers from 1 to 64",
      'schema: palette.A must be "#rrggbb"',
      "schema: parts[0].boxes[0] must have 6 integers",
      'schema: parts[0].chamfer must be "all" or "v"',
      "schema: parts[0].mirrorX must be a boolean",
    ]);
  });

  it("rejects reversed box ranges and small spheres", () => {
    const parts = [{ name: "a", color: "A", boxes: [[3, 1, 0, 0, 0, 0]], sphere: { x: 1, h: 1, d: 1, r: 0.2 } }];
    expect(messages(base({ parts }))).toEqual([
      "schema: parts[0].boxes[0] must have x0 <= x1, h0 <= h1, d0 <= d1",
      "schema: parts[0].sphere must be { x, h, d, r } with r >= 0.5",
    ]);
  });

  it("reports out-of-bounds geometry but keeps the spec", () => {
    const parts = [
      { name: "左腿", color: "A", boxes: [[5, 6, -1, 4, 5, 6]] },
      { name: "帽子", color: "A", cells: [[1, 8, 1]] },
      { name: "球", color: "A", sphere: { x: 6, h: 1, d: 1, r: 2 } },
    ];
    const { spec, issues } = validateSpec(base({ parts }));
    expect(spec).not.toBeNull();
    expect(issues.map((i) => i.message)).toEqual([
      'bounds: part "左腿" box [5,6,-1,4,5,6] goes below h=0',
      'bounds: part "帽子" cell [1,8,1] goes past h=7',
      'bounds: part "球" sphere {x: 6, h: 1, d: 1, r: 2} goes past x=7',
    ]);
  });

  it("reports unknown colors, duplicate names and too many colors", () => {
    const palette = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`A${String.fromCharCode(97 + i)}`, "#000000"]));
    const parts = [
      { name: "头发", color: "Aa" },
      { name: "头发", color: "Aa" },
      { name: "鞋", color: "Q" },
    ];
    expect(messages(base({ palette, parts }))).toEqual([
      "palette: 25 colors, the limit is 24",
      'names: "头发" appears twice',
      'palette: part "鞋" uses unknown color "Q"',
    ]);
  });
});

describe("checkGrid", () => {
  function check(parts: unknown[]) {
    const { spec } = validateSpec(base({ parts }));
    if (!spec) throw new Error("invalid test spec");
    return checkGrid(spec, buildModel(spec)).map((i) => i.message);
  }

  it("passes the avatar fixture", () => {
    const { spec } = validateSpec(hd);
    if (!spec) throw new Error("invalid fixture");
    expect(checkGrid(spec, buildModel(spec))).toEqual([]);
  });

  it("flags parts not connected to the ground", () => {
    expect(check([
      { name: "身体", color: "A", boxes: [[0, 0, 0, 3, 0, 0]] },
      { name: "帽子", color: "A", cells: [[0, 5, 0]] },
    ])).toEqual(['floating: part "帽子" is not connected to the ground']);
  });

  it("accepts parts connected through other parts", () => {
    expect(check([
      { name: "身体", color: "A", boxes: [[0, 0, 0, 3, 0, 0]] },
      { name: "手臂", color: "A", boxes: [[1, 3, 3, 3, 0, 0]] },
      { name: "球", color: "A", cells: [[3, 4, 0]] },
    ])).toEqual([]);
  });

  it("warns when paint hits nothing", () => {
    expect(check([
      { name: "身体", color: "A", cells: [[0, 0, 0]] },
      { name: "腮红", color: "A", cells: [[5, 0, 5]], paint: true },
    ])).toEqual(['paint: part "腮红" paints 0 voxels']);
  });
});
