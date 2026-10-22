import { describe, expect, it } from "vitest";
import { LIMITS, STYLES } from "../core/spec";
import type { Part, VoxelSpec } from "../core/types";
import hd from "./examples/hd.json";
import schema from "./tool.json";

// Record types make tsc fail here when a field is added to types.ts.
const specFields: Record<keyof VoxelSpec, true> = { name: true, style: true, size: true, palette: true, parts: true };
const partFields: Record<keyof Part, true> = {
  name: true,
  color: true,
  boxes: true,
  cells: true,
  sphere: true,
  chamfer: true,
  mirrorX: true,
  paint: true,
  group: true,
};

const keys = (o: object) => Object.keys(o).sort();
const parts = schema.properties.parts;

describe("tool.json", () => {
  it("has the same fields as types.ts", () => {
    expect(keys(schema.properties)).toEqual(keys(specFields));
    expect(keys(parts.items.properties)).toEqual(keys(partFields));
  });

  it("uses the limits and styles spec.ts checks", () => {
    expect(schema.properties.style.enum).toEqual(STYLES);
    expect(schema.properties.size.items.maximum).toBe(LIMITS.size);
    expect(schema.properties.palette.maxProperties).toBe(LIMITS.colors);
    expect(parts.maxItems).toBe(LIMITS.parts);
  });

  it("covers every field the bundled example uses", () => {
    expect(keys(hd).every((k) => k in schema.properties)).toBe(true);
    for (const part of hd.parts) {
      expect(keys(part).every((k) => k in parts.items.properties)).toBe(true);
    }
  });
});
