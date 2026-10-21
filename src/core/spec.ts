import { cellIndex, inBounds } from "./buildModel";
import type { Style, VoxelGrid, VoxelSpec } from "./types";

export const LIMITS = { size: 64, colors: 24, styleColors: 10, parts: 60 };

export type IssueKind = "schema" | "bounds" | "palette" | "names" | "floating" | "paint" | "style";

export interface Issue {
  level: "error" | "warning";
  kind: IssueKind;
  /** Feedback sent back to Claude, e.g. `names: "头发" appears twice`. */
  message: string;
  /** Part to flag in the UI. */
  part?: string;
}

const STYLES: Style[] = ["chibi", "object", "diorama"];

type Json = Record<string, unknown>;
type Fail = (path: string, problem: string) => void;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isInts = (v: unknown, n: number): v is number[] =>
  Array.isArray(v) && v.length === n && v.every((x) => Number.isInteger(x));
const isName = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/**
 * Checks external JSON against the VoxelSpec contract. Returns no spec when
 * the shape is wrong; other errors leave a buildable spec (bounds are clipped).
 */
export function validateSpec(input: unknown): { spec: VoxelSpec | null; issues: Issue[] } {
  const schema: Issue[] = [];
  checkShape(input, (path, problem) =>
    schema.push({ level: "error", kind: "schema", message: `schema: ${path} ${problem}` }),
  );
  if (schema.length > 0) return { spec: null, issues: schema };
  // checkShape has verified every field the type declares.
  const spec = input as VoxelSpec;
  return { spec, issues: checkContents(spec) };
}

function checkShape(input: unknown, fail: Fail): void {
  if (!isObject(input)) return fail("spec", "must be an object");
  if (!isName(input.name)) fail("name", "must be a non-empty string");
  if (!STYLES.includes(input.style as Style)) fail("style", `must be one of ${STYLES.join(", ")}`);
  if (!isInts(input.size, 3) || !input.size.every((n) => n >= 1 && n <= LIMITS.size)) {
    fail("size", `must have 3 integers from 1 to ${LIMITS.size}`);
  }
  if (!isObject(input.palette)) {
    fail("palette", "must be an object");
  } else {
    for (const [key, hex] of Object.entries(input.palette)) {
      if (!/^[A-Za-z]{1,2}$/.test(key)) fail(`palette.${key}`, "key must be 1-2 letters");
      if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) fail(`palette.${key}`, 'must be "#rrggbb"');
    }
  }
  if (!Array.isArray(input.parts)) return fail("parts", "must be an array");
  if (input.parts.length > LIMITS.parts) fail("parts", `must have at most ${LIMITS.parts} parts`);
  input.parts.forEach((part, i) => checkPartShape(part, `parts[${i}]`, fail));
}

function checkPartShape(part: unknown, path: string, fail: Fail): void {
  if (!isObject(part)) return fail(path, "must be an object");
  if (!isName(part.name)) fail(`${path}.name`, "must be a non-empty string");
  if (!isName(part.color)) fail(`${path}.color`, "must be a palette key");
  if (part.boxes !== undefined) {
    if (!Array.isArray(part.boxes)) {
      fail(`${path}.boxes`, "must be an array");
    } else {
      part.boxes.forEach((box, j) => {
        if (!isInts(box, 6)) return fail(`${path}.boxes[${j}]`, "must have 6 integers");
        const [x0, x1, h0, h1, d0, d1] = box as [number, number, number, number, number, number];
        if (x0 > x1 || h0 > h1 || d0 > d1) fail(`${path}.boxes[${j}]`, "must have x0 <= x1, h0 <= h1, d0 <= d1");
      });
    }
  }
  if (part.cells !== undefined) {
    if (!Array.isArray(part.cells)) {
      fail(`${path}.cells`, "must be an array");
    } else {
      part.cells.forEach((cell, j) => {
        if (!isInts(cell, 3)) fail(`${path}.cells[${j}]`, "must have 3 integers");
      });
    }
  }
  if (part.sphere !== undefined) {
    const s = part.sphere;
    const ok = isObject(s) && [s.x, s.h, s.d, s.r].every(Number.isFinite) && (s.r as number) >= 0.5;
    if (!ok) fail(`${path}.sphere`, "must be { x, h, d, r } with r >= 0.5");
  }
  if (part.chamfer !== undefined && part.chamfer !== "all" && part.chamfer !== "v") {
    fail(`${path}.chamfer`, 'must be "all" or "v"');
  }
  for (const flag of ["mirrorX", "paint"] as const) {
    if (part[flag] !== undefined && typeof part[flag] !== "boolean") fail(`${path}.${flag}`, "must be a boolean");
  }
  if (part.group !== undefined && !isName(part.group)) fail(`${path}.group`, "must be a non-empty string");
}

function checkContents(spec: VoxelSpec): Issue[] {
  const issues: Issue[] = [];
  const colors = Object.keys(spec.palette).length;
  if (colors > LIMITS.colors) {
    issues.push({ level: "error", kind: "palette", message: `palette: ${colors} colors, the limit is ${LIMITS.colors}` });
  } else if (colors > LIMITS.styleColors) {
    issues.push({ level: "warning", kind: "style", message: `style: ${colors} colors, keep it under ${LIMITS.styleColors}` });
  }

  const seen = new Map<string, number>();
  for (const part of spec.parts) seen.set(part.name, (seen.get(part.name) ?? 0) + 1);
  for (const [name, n] of seen) {
    if (n > 1) {
      const times = n === 2 ? "twice" : `${n} times`;
      issues.push({ level: "error", kind: "names", message: `names: "${name}" appears ${times}`, part: name });
    }
  }

  for (const part of spec.parts) {
    if (!(part.color in spec.palette)) {
      issues.push({
        level: "error",
        kind: "palette",
        message: `palette: part "${part.name}" uses unknown color "${part.color}"`,
        part: part.name,
      });
    }
    for (const [label, ranges] of partExtents(part)) {
      const problem = outOfBounds(spec.size, ranges);
      if (problem) {
        issues.push({
          level: "error",
          kind: "bounds",
          message: `bounds: part "${part.name}" ${label} ${problem}`,
          part: part.name,
        });
      }
    }
  }
  return issues;
}

type Ranges = { x: [number, number]; h: [number, number]; d: [number, number] };

function* partExtents(part: VoxelSpec["parts"][number]): Generator<[string, Ranges]> {
  for (const box of part.boxes ?? []) {
    const [x0, x1, h0, h1, d0, d1] = box;
    yield [`box [${box.join(",")}]`, { x: [x0, x1], h: [h0, h1], d: [d0, d1] }];
  }
  for (const cell of part.cells ?? []) {
    const [x, h, d] = cell;
    yield [`cell [${cell.join(",")}]`, { x: [x, x], h: [h, h], d: [d, d] }];
  }
  if (part.sphere) {
    const { x, h, d, r } = part.sphere;
    const span = (c: number): [number, number] => [Math.ceil(c - r), Math.floor(c + r)];
    yield [`sphere {x: ${x}, h: ${h}, d: ${d}, r: ${r}}`, { x: span(x), h: span(h), d: span(d) }];
  }
}

function outOfBounds(size: VoxelSpec["size"], ranges: Ranges): string | null {
  const [w, depth, height] = size;
  const limits = { x: w - 1, h: height - 1, d: depth - 1 };
  for (const axis of ["x", "h", "d"] as const) {
    const [lo, hi] = ranges[axis];
    if (lo < 0) return `goes below ${axis}=0`;
    if (hi > limits[axis]) return `goes past ${axis}=${limits[axis]}`;
  }
  return null;
}

/** Checks that need the built grid: floating parts and paint that hits nothing. */
export function checkGrid(spec: VoxelSpec, grid: VoxelGrid): Issue[] {
  const issues: Issue[] = [];
  spec.parts.forEach((part, i) => {
    if (part.paint && grid.writes[i] === 0) {
      issues.push({ level: "warning", kind: "paint", message: `paint: part "${part.name}" paints 0 voxels`, part: part.name });
    }
  });
  for (const i of floatingParts(grid)) {
    const name = spec.parts[i]?.name ?? `#${i}`;
    issues.push({
      level: "error",
      kind: "floating",
      message: `floating: part "${name}" is not connected to the ground`,
      part: name,
    });
  }
  return issues;
}

/** Parts owning voxels that no face-adjacent path links to h = 0. */
function floatingParts(grid: VoxelGrid): number[] {
  const [w, depth] = grid.size;
  const reached = new Uint8Array(grid.cells.length);
  const queue: [number, number, number][] = [];
  for (let x = 0; x < w; x++) {
    for (let d = 0; d < depth; d++) {
      const i = cellIndex(grid.size, x, 0, d);
      if (grid.cells[i]) {
        reached[i] = 1;
        queue.push([x, 0, d]);
      }
    }
  }
  const steps = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
  for (let q = 0; q < queue.length; q++) {
    const [x, h, d] = queue[q]!;
    for (const [dx, dh, dd] of steps) {
      const nx = x + dx, nh = h + dh, nd = d + dd;
      if (!inBounds(grid.size, nx, nh, nd)) continue;
      const i = cellIndex(grid.size, nx, nh, nd);
      if (grid.cells[i] && !reached[i]) {
        reached[i] = 1;
        queue.push([nx, nh, nd]);
      }
    }
  }
  const floating = new Set<number>();
  grid.cells.forEach((voxel, i) => {
    if (voxel && !reached[i]) floating.add(voxel.part);
  });
  return [...floating].sort((a, b) => a - b);
}
