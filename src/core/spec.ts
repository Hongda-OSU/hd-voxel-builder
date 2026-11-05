import { cellIndex, inBounds } from "./buildModel";
import type { Style, VoxelGrid, VoxelSpec } from "./types";

export const LIMITS = { size: 64, colors: 24, styleColors: 10, parts: 60 };

export type IssueKind = "schema" | "bounds" | "palette" | "names" | "floating" | "paint" | "style";

export interface Issue {
  level: "error" | "warning";
  kind: IssueKind;
  /** Feedback sent back to Claude, e.g. `names: "头发" appears twice`. */
  message: string;
  /** The same problem in Chinese, for the UI. */
  text: string;
  /** Part to flag in the UI. */
  part?: string;
}

export const STYLES: Style[] = ["chibi", "object", "diorama"];

type Json = Record<string, unknown>;
/** Reports a shape problem in English for Claude and in Chinese for the UI. */
type Fail = (path: string, problem: string, zh: string) => void;

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
  checkShape(input, (path, problem, zh) =>
    schema.push({ level: "error", kind: "schema", message: `schema: ${path} ${problem}`, text: `格式不对：${path} ${zh}` }),
  );
  if (schema.length > 0) return { spec: null, issues: schema };
  // checkShape has verified every field the type declares.
  const spec = input as VoxelSpec;
  return { spec, issues: checkContents(spec) };
}

function checkShape(input: unknown, fail: Fail): void {
  if (!isObject(input)) return fail("spec", "must be an object", "要是一个对象");
  if (!isName(input.name)) fail("name", "must be a non-empty string", "不能为空");
  if (!STYLES.includes(input.style as Style)) {
    fail("style", `must be one of ${STYLES.join(", ")}`, `只能是 ${STYLES.join("、")} 之一`);
  }
  if (!isInts(input.size, 3) || !input.size.every((n) => n >= 1 && n <= LIMITS.size)) {
    fail("size", `must have 3 integers from 1 to ${LIMITS.size}`, `要是 3 个 1 到 ${LIMITS.size} 的整数`);
  }
  if (!isObject(input.palette)) {
    fail("palette", "must be an object", "要是一个对象");
  } else {
    for (const [key, hex] of Object.entries(input.palette)) {
      if (!/^[A-Za-z]{1,2}$/.test(key)) fail(`palette.${key}`, "key must be 1-2 letters", "颜色的 key 要是 1 到 2 个字母");
      if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
        fail(`palette.${key}`, 'must be "#rrggbb"', "要写成 #rrggbb");
      }
    }
  }
  if (!Array.isArray(input.parts)) return fail("parts", "must be an array", "要是一个列表");
  if (input.parts.length > LIMITS.parts) {
    fail("parts", `must have at most ${LIMITS.parts} parts`, `最多 ${LIMITS.parts} 个部件`);
  }
  input.parts.forEach((part, i) => checkPartShape(part, `parts[${i}]`, fail));
}

function checkPartShape(part: unknown, path: string, fail: Fail): void {
  if (!isObject(part)) return fail(path, "must be an object", "要是一个对象");
  if (!isName(part.name)) fail(`${path}.name`, "must be a non-empty string", "不能为空");
  if (!isName(part.color)) fail(`${path}.color`, "must be a palette key", "要是调色板里的颜色 key");
  if (part.boxes !== undefined) {
    if (!Array.isArray(part.boxes)) {
      fail(`${path}.boxes`, "must be an array", "要是一个列表");
    } else {
      part.boxes.forEach((box, j) => {
        if (!isInts(box, 6)) return fail(`${path}.boxes[${j}]`, "must have 6 integers", "要有 6 个整数");
        const [x0, x1, h0, h1, d0, d1] = box as [number, number, number, number, number, number];
        if (x0 > x1 || h0 > h1 || d0 > d1) {
          fail(`${path}.boxes[${j}]`, "must have x0 <= x1, h0 <= h1, d0 <= d1", "每一对坐标都要前小后大");
        }
      });
    }
  }
  if (part.cells !== undefined) {
    if (!Array.isArray(part.cells)) {
      fail(`${path}.cells`, "must be an array", "要是一个列表");
    } else {
      part.cells.forEach((cell, j) => {
        if (!isInts(cell, 3)) fail(`${path}.cells[${j}]`, "must have 3 integers", "要有 3 个整数");
      });
    }
  }
  if (part.sphere !== undefined) {
    const s = part.sphere;
    const ok = isObject(s) && [s.x, s.h, s.d, s.r].every(Number.isFinite) && (s.r as number) >= 0.5;
    if (!ok) fail(`${path}.sphere`, "must be { x, h, d, r } with r >= 0.5", "要写成 { x, h, d, r }，半径 r 至少 0.5");
  }
  if (part.chamfer !== undefined && part.chamfer !== "all" && part.chamfer !== "v") {
    fail(`${path}.chamfer`, 'must be "all" or "v"', "只能是 all 或 v");
  }
  for (const flag of ["mirrorX", "paint"] as const) {
    if (part[flag] !== undefined && typeof part[flag] !== "boolean") {
      fail(`${path}.${flag}`, "must be a boolean", "只能是 true 或 false");
    }
  }
  if (part.group !== undefined && !isName(part.group)) {
    fail(`${path}.group`, "must be a non-empty string", "不能为空");
  }
}

function checkContents(spec: VoxelSpec): Issue[] {
  const issues: Issue[] = [];
  const colors = Object.keys(spec.palette).length;
  if (colors > LIMITS.colors) {
    issues.push({
      level: "error",
      kind: "palette",
      message: `palette: ${colors} colors, the limit is ${LIMITS.colors}`,
      text: `用了 ${colors} 种颜色，最多只能 ${LIMITS.colors} 种`,
    });
  } else if (colors > LIMITS.styleColors) {
    issues.push({
      level: "warning",
      kind: "style",
      message: `style: ${colors} colors, keep it under ${LIMITS.styleColors}`,
      text: `用了 ${colors} 种颜色，建议不超过 ${LIMITS.styleColors} 种`,
    });
  }

  const seen = new Map<string, number>();
  for (const part of spec.parts) seen.set(part.name, (seen.get(part.name) ?? 0) + 1);
  for (const [name, n] of seen) {
    if (n > 1) {
      const times = n === 2 ? "twice" : `${n} times`;
      issues.push({
        level: "error",
        kind: "names",
        message: `names: "${name}" appears ${times}`,
        text: `部件名「${name}」重复了 ${n} 次`,
        part: name,
      });
    }
  }

  for (const part of spec.parts) {
    if (!(part.color in spec.palette)) {
      issues.push({
        level: "error",
        kind: "palette",
        message: `palette: part "${part.name}" uses unknown color "${part.color}"`,
        text: `「${part.name}」用了调色板里没有的颜色 ${part.color}`,
        part: part.name,
      });
    }
    for (const [label, ranges] of partExtents(part)) {
      const problem = outOfBounds(spec.size, ranges);
      if (problem) {
        issues.push({
          level: "error",
          kind: "bounds",
          message: `bounds: part "${part.name}" ${label} ${problem.en}`,
          text: `「${part.name}」超出画布（${problem.zh}），超出的部分已裁掉`,
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

function outOfBounds(size: VoxelSpec["size"], ranges: Ranges): { en: string; zh: string } | null {
  const [w, depth, height] = size;
  const limits = { x: w - 1, h: height - 1, d: depth - 1 };
  for (const axis of ["x", "h", "d"] as const) {
    const [lo, hi] = ranges[axis];
    if (lo < 0) return { en: `goes below ${axis}=0`, zh: `${axis} 小于 0` };
    if (hi > limits[axis]) return { en: `goes past ${axis}=${limits[axis]}`, zh: `${axis} 超过 ${limits[axis]}` };
  }
  return null;
}

/** Checks that need the built grid: floating parts and paint that hits nothing. */
export function checkGrid(spec: VoxelSpec, grid: VoxelGrid): Issue[] {
  const issues: Issue[] = [];
  spec.parts.forEach((part, i) => {
    if (part.paint && grid.writes[i] === 0) {
      issues.push({
        level: "warning",
        kind: "paint",
        message: `paint: part "${part.name}" paints 0 voxels`,
        text: `「${part.name}」只涂色，但没有涂到任何方块`,
        part: part.name,
      });
    }
  });
  for (const i of floatingParts(grid)) {
    const name = spec.parts[i]?.name ?? `#${i}`;
    issues.push({
      level: "error",
      kind: "floating",
      message: `floating: part "${name}" is not connected to the ground`,
      text: `「${name}」没有连到地面，悬空了`,
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
