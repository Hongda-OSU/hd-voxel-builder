import { buildModel } from "./buildModel";
import { STYLES, validateSpec } from "./spec";
import type { Part, Style, VoxelSpec } from "./types";

export type ModelName = "opus" | "sonnet";
export type VersionKind = "generate" | "edit" | "example";

/** Parts that differ from the version an edit started from, by name. */
export interface Changes {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface Version {
  n: number;
  kind: VersionKind;
  /** The version an edit started from; after a rollback it is not the previous one. */
  base?: number;
  prompt: string;
  model?: ModelName;
  seconds?: number;
  retried: boolean;
  /** True when the project's reference images went with the request. */
  attached?: boolean;
  createdAt: string;
  spec: VoxelSpec;
  changes: Changes;
}

/** The project.json format; the native side only stores it. */
export interface Project {
  format: 1;
  id: string;
  name: string;
  style: Style;
  createdAt: string;
  updatedAt: string;
  current: number;
  /** The example a project was copied from. */
  from?: string;
  /** Reference image files in refs/, e.g. ["1.png", "2.jpg"]. */
  refs?: string[];
  versions: Version[];
}

/** What a finished generation or edit adds. */
export interface VersionInput {
  spec: VoxelSpec;
  prompt: string;
  model?: ModelName;
  seconds?: number;
  retried?: boolean;
  attached?: boolean;
}

const two = (n: number) => String(n).padStart(2, "0");

/** A readable timestamp with the local offset, e.g. 2026-11-05T14:32:08-05:00. */
export function localIso(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const zone = `${sign}${two(Math.floor(Math.abs(offset) / 60))}:${two(Math.abs(offset) % 60)}`;
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}` +
    `T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}${zone}`
  );
}

/** A folder-safe id from the time, e.g. 20261105-1432, with -2, -3… when taken. */
export function projectId(date: Date, taken: Iterable<string>): string {
  const base =
    `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}` +
    `-${two(date.getHours())}${two(date.getMinutes())}`;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const NO_CHANGES: Changes = { added: [], removed: [], changed: [] };

/** A part counts as changed when its fields or the colour its key resolves to differ. */
export function diffParts(before: VoxelSpec, after: VoxelSpec): Changes {
  const old = new Map(before.parts.map((part) => [part.name, part]));
  const now = new Map(after.parts.map((part) => [part.name, part]));
  const look = (spec: VoxelSpec, part: Part) => JSON.stringify([part, spec.palette[part.color]]);
  return {
    added: after.parts.filter((part) => !old.has(part.name)).map((part) => part.name),
    removed: before.parts.filter((part) => !now.has(part.name)).map((part) => part.name),
    changed: after.parts
      .filter((part) => {
        const previous = old.get(part.name);
        return previous !== undefined && look(before, previous) !== look(after, part);
      })
      .map((part) => part.name),
  };
}

export function currentVersion(project: Project): Version | undefined {
  return project.versions.find((version) => version.n === project.current);
}

/** Fields both kinds of version take from a VersionInput. */
function inputFields(input: VersionInput) {
  return {
    prompt: input.prompt,
    ...(input.model ? { model: input.model } : {}),
    ...(input.seconds !== undefined ? { seconds: input.seconds } : {}),
    retried: input.retried ?? false,
    ...(input.attached ? { attached: true } : {}),
  };
}

/** A new project whose first version is a generation or a copied example. */
export function createProject(
  id: string,
  kind: "generate" | "example",
  input: VersionInput,
  now: Date,
  { from, refs }: { from?: string; refs?: string[] } = {},
): Project {
  const at = localIso(now);
  return {
    format: 1,
    id,
    name: input.spec.name,
    style: input.spec.style,
    createdAt: at,
    updatedAt: at,
    current: 1,
    ...(from ? { from } : {}),
    ...(refs && refs.length > 0 ? { refs } : {}),
    versions: [
      {
        n: 1,
        kind,
        ...inputFields(input),
        createdAt: at,
        spec: input.spec,
        changes: NO_CHANGES,
      },
    ],
  };
}

/** Appends an edit made on the current version and makes it current. */
export function addEdit(project: Project, input: VersionInput, now: Date): Project {
  const base = currentVersion(project);
  if (!base) throw new Error(`project ${project.id} has no version ${project.current}`);
  const n = Math.max(...project.versions.map((version) => version.n)) + 1;
  const at = localIso(now);
  const version: Version = {
    n,
    kind: "edit",
    base: base.n,
    ...inputFields(input),
    createdAt: at,
    spec: input.spec,
    changes: diffParts(base.spec, input.spec),
  };
  return { ...project, updatedAt: at, current: n, versions: [...project.versions, version] };
}

/** Shows another version; nothing is deleted. */
export function setCurrent(project: Project, n: number, now: Date): Project {
  if (!project.versions.some((version) => version.n === n)) return project;
  return { ...project, current: n, updatedAt: localIso(now) };
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const KINDS: VersionKind[] = ["generate", "edit", "example"];

function parseVersion(input: unknown): Version | null {
  if (!isObject(input)) return null;
  const { n, kind, base, prompt, model, seconds, retried, attached, createdAt, spec, changes } = input;
  if (!Number.isInteger(n) || !KINDS.includes(kind as VersionKind)) return null;
  if (base !== undefined && !Number.isInteger(base)) return null;
  if (typeof prompt !== "string" || typeof retried !== "boolean" || typeof createdAt !== "string") return null;
  if (model !== undefined && model !== "opus" && model !== "sonnet") return null;
  if (seconds !== undefined && typeof seconds !== "number") return null;
  if (attached !== undefined && typeof attached !== "boolean") return null;
  if (!isObject(changes) || !isStrings(changes.added) || !isStrings(changes.removed) || !isStrings(changes.changed)) {
    return null;
  }
  // Content problems (floating parts, too many colours) still load; only a broken shape fails.
  if (!validateSpec(spec).spec) return null;
  return input as unknown as Version;
}

/** Checks a project.json read from disk; null when it cannot be opened. */
export function parseProject(input: unknown): Project | null {
  if (!isObject(input) || input.format !== 1) return null;
  const { id, name, style, createdAt, updatedAt, current, from, refs, versions } = input;
  if (typeof id !== "string" || typeof name !== "string" || !STYLES.includes(style as Style)) return null;
  if (typeof createdAt !== "string" || typeof updatedAt !== "string" || !Number.isInteger(current)) return null;
  if (from !== undefined && typeof from !== "string") return null;
  if (refs !== undefined && !isStrings(refs)) return null;
  if (!Array.isArray(versions) || versions.length === 0 || !versions.every((v) => parseVersion(v))) return null;
  const project = input as unknown as Project;
  return currentVersion(project) ? project : null;
}

/** The colour that covers the most voxels, for a project's swatch; null for a broken spec. */
export function mainColor(input: unknown): string | null {
  const { spec } = validateSpec(input);
  if (!spec) return null;
  const counts = new Map<string, number>();
  for (const voxel of buildModel(spec).cells) {
    if (voxel) counts.set(voxel.color, (counts.get(voxel.color) ?? 0) + 1);
  }
  const [key] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  return key === undefined ? null : (spec.palette[key] ?? null);
}
