import { describe, expect, it } from "vitest";
import { examples } from "../prompts/examples";
import {
  addEdit,
  createProject,
  currentVersion,
  diffParts,
  localIso,
  mainColor,
  parseProject,
  projectId,
  setCurrent,
} from "./project";
import { validateSpec } from "./spec";
import type { VoxelSpec } from "./types";

const basketball = validateSpec(examples.find((e) => e.id === "basketball")?.data).spec as VoxelSpec;
const at = (minute: number) => new Date(2026, 10, 5, 14, minute, 8);

describe("ids and timestamps", () => {
  it("names a project after the minute it was made", () => {
    expect(projectId(at(32), [])).toBe("20261105-1432");
    expect(projectId(at(32), ["20261105-1432"])).toBe("20261105-1432-2");
    expect(projectId(at(32), ["20261105-1432", "20261105-1432-2"])).toBe("20261105-1432-3");
  });

  it("writes local time with its offset", () => {
    expect(localIso(at(32))).toMatch(/^2026-11-05T14:32:08[+-]\d{2}:\d{2}$/);
    // The offset is the local one, so parsing gives back the same instant.
    expect(Date.parse(localIso(at(32)))).toBe(at(32).getTime());
  });
});

describe("diffParts", () => {
  it("lists added, removed and changed parts by name", () => {
    const after: VoxelSpec = {
      ...basketball,
      parts: [
        { ...basketball.parts[0]!, sphere: { x: 14, h: 14, d: 14, r: 13 } },
        ...basketball.parts.slice(2),
        { name: "气门", color: basketball.parts[1]!.color, cells: [[14, 27, 14]] },
      ],
    };
    expect(diffParts(basketball, after)).toEqual({
      added: ["气门"],
      removed: [basketball.parts[1]!.name],
      changed: [basketball.parts[0]!.name],
    });
  });

  it("counts a recoloured palette key as a change", () => {
    const key = basketball.parts[0]!.color;
    const after = { ...basketball, palette: { ...basketball.palette, [key]: "#ff0000" } };
    expect(diffParts(basketball, after).changed).toEqual([basketball.parts[0]!.name]);
    expect(diffParts(basketball, basketball)).toEqual({ added: [], removed: [], changed: [] });
  });
});

describe("project versions", () => {
  const first = createProject(
    "20261105-1432",
    "generate",
    { spec: basketball, prompt: "一个篮球", model: "opus", seconds: 31, retried: false },
    at(32),
  );
  const longer = { ...basketball, size: [28, 30, 28] as VoxelSpec["size"] };

  it("starts at version 1 with no changes", () => {
    expect(first).toMatchObject({ format: 1, name: "篮球", style: "object", current: 1 });
    expect(first.versions[0]).toMatchObject({ n: 1, kind: "generate", model: "opus", seconds: 31 });
    expect(first.createdAt).toBe(first.updatedAt);
  });

  it("appends edits on the current version and keeps rolled-back ones", () => {
    const edited = addEdit(first, { spec: longer, prompt: "再长一点", model: "sonnet", seconds: 20 }, at(40));
    expect(edited.current).toBe(2);
    expect(edited.versions[1]).toMatchObject({ n: 2, kind: "edit", base: 1, model: "sonnet" });

    // Back to v1, then edit again: v3 starts from v1 and v2 stays.
    const back = setCurrent(edited, 1, at(41));
    const again = addEdit(back, { spec: basketball, prompt: "不变" }, at(42));
    expect(again.versions.map((v) => [v.n, v.base])).toEqual([[1, undefined], [2, 1], [3, 1]]);
    expect(currentVersion(again)?.n).toBe(3);
    expect(again.updatedAt).toBe(localIso(at(42)));
  });

  it("ignores rollbacks to versions that do not exist", () => {
    expect(setCurrent(first, 9, at(50))).toBe(first);
  });

  it("records the example a project was copied from", () => {
    const copy = createProject("20261105-1500", "example", { spec: basketball, prompt: "" }, at(0), "basketball");
    expect(copy.from).toBe("basketball");
    expect(copy.versions[0]).not.toHaveProperty("model");
  });
});

describe("parseProject", () => {
  const saved = JSON.parse(
    JSON.stringify(createProject("20261105-1432", "generate", { spec: basketball, prompt: "一个篮球" }, at(32))),
  ) as unknown;

  it("accepts what createProject writes after a JSON round trip", () => {
    expect(parseProject(saved)?.name).toBe("篮球");
  });

  it("rejects broken files", () => {
    const broken = (patch: object) => parseProject({ ...(saved as object), ...patch });
    expect(parseProject(null)).toBeNull();
    expect(broken({ format: 2 })).toBeNull();
    expect(broken({ style: "anime" })).toBeNull();
    expect(broken({ current: 5 })).toBeNull();
    expect(broken({ versions: [] })).toBeNull();
    expect(broken({ versions: [{ n: 1, kind: "generate", prompt: "", retried: false, createdAt: "", spec: {} }] })).toBeNull();
  });
});

describe("mainColor", () => {
  it("picks the colour covering the most voxels", () => {
    const key = basketball.parts[0]!.color;
    expect(mainColor(basketball)).toBe(basketball.palette[key]);
    expect(mainColor({ name: "broken" })).toBeNull();
  });
});
