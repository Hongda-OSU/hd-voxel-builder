import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { examples } from "../prompts/examples";
import { createProject } from "../core/project";
import { validateSpec } from "../core/spec";
import type { VoxelSpec } from "../core/types";
import { blockingIssues, editPrompt, retryPrompt, useGenerateStore } from "./generateStore";
import { useModelStore } from "./modelStore";
import { useProjectStore } from "./projectStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mocked = vi.mocked(invoke);
const store = useGenerateStore;
const good = examples.find((e) => e.id === "basketball")?.data;
const floating = {
  name: "ball",
  style: "object",
  size: [8, 8, 8],
  palette: { A: "#111111" },
  parts: [{ name: "ball", color: "A", boxes: [[2, 3, 4, 5, 2, 3]] }],
};

/** Answers `generate` with each spec in turn. */
function replies(...specs: unknown[]) {
  const queue = [...specs];
  mocked.mockImplementation(async (command: string) => {
    if (command === "generate") return queue.shift();
    // The saved project is listed, as on disk; otherwise the store would think it was deleted.
    if (command === "list_projects") {
      const open = useProjectStore.getState().project;
      return open ? [{ id: open.id, name: open.name, style: open.style, updatedAt: open.updatedAt, current: open.current, versions: open.versions.length, spec: {} }] : [];
    }
    return undefined;
  });
}

const saveCalls = () => mocked.mock.calls.filter(([command]) => command === "save_project");

const generateCalls = () =>
  mocked.mock.calls.filter(([command]) => command === "generate").map(([, args]) => args as { text: string });

describe("generateStore", () => {
  beforeEach(() => {
    mocked.mockReset();
    store.setState({ style: "object", description: "一个篮球", model: "opus", phase: { step: "idle" } });
    useModelStore.getState().loadSpec({ name: "none" });
    useProjectStore.setState({ projects: [], project: null, error: null });
  });

  it("loads a valid spec after one call", async () => {
    replies(good);
    await store.getState().generate();
    expect(generateCalls()).toEqual([{ text: "一个篮球", style: "object", model: "opus" }]);
    expect(useModelStore.getState().spec?.name).toBe("篮球");
    expect(useModelStore.getState().modelId).toMatch(/^\d{8}-\d{4}$/);
    expect(saveCalls()).toHaveLength(1);
    expect(store.getState().phase).toMatchObject({ step: "done", retried: false });
    expect(store.getState().phase).toMatchObject({ id: useModelStore.getState().modelId });
    expect(store.getState().description).toBe("");
  });

  it("retries once with the problems and the previous spec", async () => {
    replies(floating, good);
    await store.getState().generate();
    const [, retry] = generateCalls();
    expect(retry?.text).toContain('floating: part "ball" is not connected to the ground');
    expect(retry?.text).toContain('"name":"ball"');
    expect(store.getState().phase).toMatchObject({ step: "done", retried: true });
  });

  it("shows the second result even when it still has problems", async () => {
    replies(floating, floating);
    await store.getState().generate();
    expect(generateCalls()).toHaveLength(2);
    expect(useModelStore.getState().issues.some((i) => i.kind === "floating")).toBe(true);
  });

  it("reports native errors", async () => {
    mocked.mockRejectedValue("已取消");
    await store.getState().generate();
    expect(store.getState().phase).toEqual({ step: "error", message: "已取消" });
    expect(store.getState().description).toBe("一个篮球");
  });

  it("needs a description", async () => {
    store.setState({ description: "  " });
    await store.getState().generate();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("cancels only while generating", async () => {
    await store.getState().cancel();
    expect(mocked).not.toHaveBeenCalled();
    store.setState({ phase: { step: "generating", attempt: 1, startedAt: 0, editing: false } });
    await store.getState().cancel();
    expect(mocked).toHaveBeenCalledWith("cancel_generation");
  });

  it("reads the Claude Code status", async () => {
    mocked.mockResolvedValue("loggedOut");
    await store.getState().checkClaude();
    expect(store.getState().claude).toBe("loggedOut");
  });
});

describe("helpers", () => {
  it("lists only errors as blocking", () => {
    expect(blockingIssues(good)).toEqual([]);
    expect(blockingIssues(floating)).toHaveLength(1);
    expect(blockingIssues({ name: "x" })[0]).toMatch(/^schema:/);
  });

  it("writes the retry request", () => {
    const text = retryPrompt("一个篮球", { a: 1 }, ["bounds: x"]);
    expect(text.split("\n")[0]).toBe("一个篮球");
    expect(text).toContain("- bounds: x");
    expect(text.endsWith('{"a":1}')).toBe(true);
  });

  it("does not save a result whose shape is broken", async () => {
    replies({ name: "x" }, { name: "x" });
    await store.getState().generate();
    expect(saveCalls()).toHaveLength(0);
    expect(useModelStore.getState().spec).toBeNull();
    expect(store.getState().phase).toMatchObject({ step: "done", retried: true });
  });

  describe("with a project open", () => {
    const ball = validateSpec(good).spec as VoxelSpec;
    const open = () => {
      const project = createProject("20261106-0900", "generate", { spec: ball, prompt: "一个篮球" }, new Date(2026, 10, 6, 9));
      useProjectStore.setState({ project: { ...project, style: "chibi" } });
    };
    const bigger = { ...ball, size: [30, 30, 30] };

    it("edits the current version in the project's style", async () => {
      open();
      store.setState({ description: "再大一点" });
      replies(bigger);
      await store.getState().generate();
      const [call] = generateCalls() as { text: string; style: string }[];
      expect(call?.text).toBe(editPrompt("再大一点", ball));
      expect(call?.style).toBe("chibi");
      const project = useProjectStore.getState().project;
      expect(project?.current).toBe(2);
      expect(project?.versions[1]).toMatchObject({ kind: "edit", base: 1, prompt: "再大一点" });
      expect(saveCalls()).toHaveLength(1);
      expect(store.getState().phase).toMatchObject({ step: "done", editing: true });
    });

    it("keeps the current version when an edit comes back broken", async () => {
      open();
      store.setState({ description: "再大一点" });
      replies({ name: "x" }, { name: "x" });
      await store.getState().generate();
      expect(useProjectStore.getState().project?.versions).toHaveLength(1);
      expect(saveCalls()).toHaveLength(0);
      expect(store.getState().phase).toMatchObject({ step: "error" });
      expect(store.getState().description).toBe("再大一点");
    });
  });

  it("writes the edit request with the instruction and the spec", () => {
    const text = editPrompt("车斗再长两格", { name: "卡车" } as VoxelSpec);
    expect(text.split("\n")).toEqual(["Edit request:", "车斗再长两格", "", "Current spec:", '{"name":"卡车"}']);
  });
});
