import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { examples } from "../prompts/examples";
import { createProject } from "../core/project";
import { validateSpec } from "../core/spec";
import type { VoxelSpec } from "../core/types";
import { blockingIssues, editPrompt, retryPrompt, useGenerateStore } from "./generateStore";
import { useModelStore } from "./modelStore";
import { useProjectStore } from "./projectStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
// Canvas is not available here; each "image" becomes a PNG named after its contents.
vi.mock("../render/refImage", () => ({
  prepareImage: async (file: Blob) => ({ mediaType: "image/png", data: btoa(await file.text()) }),
}));

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
    if (command === "describe") return "主体：红色邮筒\n风格：物体";
    // The saved project is listed, as on disk; otherwise the store would think it was deleted.
    if (command === "list_projects") {
      const open = useProjectStore.getState().project;
      return open
        ? [
            {
              id: open.id,
              name: open.name,
              style: open.style,
              updatedAt: open.updatedAt,
              current: open.current,
              versions: open.versions.length,
              spec: {},
            },
          ]
        : [];
    }
    return undefined;
  });
}

const saveCalls = () => mocked.mock.calls.filter(([command]) => command === "save_project");

const generateCalls = () =>
  mocked.mock.calls
    .filter(([command]) => command === "generate")
    .map(([, args]) => args as { text: string; images: { mediaType: string; data: string }[] });

const png = (text: string) => new Blob([text], { type: "image/png" });
const ref = (text: string) => ({ mediaType: "image/png" as const, data: btoa(text) });

describe("generateStore", () => {
  beforeEach(() => {
    mocked.mockReset();
    store.setState({
      style: "object",
      description: "一个篮球",
      model: "opus",
      phase: { step: "idle" },
      refs: [],
      attach: true,
      attachFor: null,
    });
    useModelStore.getState().loadSpec({ name: "none" });
    useProjectStore.setState({ projects: [], project: null, editing: false, refs: [], error: null });
  });

  it("loads a valid spec after one call", async () => {
    replies(good);
    await store.getState().generate();
    expect(generateCalls()).toEqual([{ text: "一个篮球", style: "object", model: "opus", images: [] }]);
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

  it("cancels only while Claude is working", async () => {
    await store.getState().cancel();
    expect(mocked).not.toHaveBeenCalled();
    store.setState({ phase: { step: "generating", attempt: 1, startedAt: 0, editing: false } });
    await store.getState().cancel();
    store.setState({ phase: { step: "describing", startedAt: 0 } });
    await store.getState().cancel();
    expect(mocked.mock.calls).toEqual([["cancel_generation"], ["cancel_generation"]]);
  });

  it("reads the Claude Code status", async () => {
    mocked.mockResolvedValue("loggedOut");
    await store.getState().checkClaude();
    expect(store.getState().claude).toBe("loggedOut");
  });
});

describe("reference images", () => {
  beforeEach(() => {
    mocked.mockReset();
    store.setState({
      style: "chibi",
      description: "",
      phase: { step: "idle" },
      refs: [],
      attach: true,
      attachFor: null,
    });
    useProjectStore.setState({ projects: [], project: null, editing: false, refs: [], error: null });
  });

  // The helper tests below expect no project open.
  afterEach(() => useProjectStore.setState({ projects: [], project: null, editing: false, refs: [], error: null }));

  it("keeps images only, up to three", async () => {
    await store.getState().addRefs([png("a"), new Blob(["x"], { type: "text/plain" }), png("b")]);
    expect(store.getState().refs).toEqual([ref("a"), ref("b")]);
    await store.getState().addRefs([png("c"), png("d")]);
    expect(store.getState().refs).toEqual([ref("a"), ref("b"), ref("c")]);
    expect(store.getState().phase).toEqual({ step: "error", message: "最多 3 张参考图" });
    store.getState().removeRef(1);
    expect(store.getState().refs).toEqual([ref("a"), ref("c")]);
  });

  it("drafts a description after what is typed and follows its style", async () => {
    replies();
    store.setState({ refs: [ref("a")], description: "要矮一点" });
    await store.getState().describe();
    expect(mocked).toHaveBeenCalledWith("describe", { model: "opus", images: [ref("a")] });
    expect(store.getState().description).toBe("要矮一点\n\n主体：红色邮筒\n风格：物体");
    expect(store.getState().style).toBe("object");
    expect(store.getState().phase).toEqual({ step: "described" });
  });

  it("does not describe without images", async () => {
    await store.getState().describe();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("sends the images with a new project and saves them with it", async () => {
    replies(floating, good);
    store.setState({ refs: [ref("a"), ref("b")], description: "邮筒" });
    await store.getState().generate();
    expect(generateCalls().map((call) => call.images)).toEqual([
      [ref("a"), ref("b")],
      [ref("a"), ref("b")],
    ]);
    const project = useProjectStore.getState().project;
    expect(project?.refs).toEqual(["1.png", "2.png"]);
    expect(project?.versions[0]?.attached).toBe(true);
    expect(store.getState()).toMatchObject({ refs: [], attach: true });
  });

  it("keeps the images with the project when they were not sent", async () => {
    replies(good);
    store.setState({ refs: [ref("a")], description: "邮筒", attach: false });
    await store.getState().generate();
    expect(generateCalls()[0]?.images).toEqual([]);
    const project = useProjectStore.getState().project;
    expect(project?.refs).toEqual(["1.png"]);
    expect(project?.versions[0]).not.toHaveProperty("attached");
  });

  it("attaches a project's own images to an edit only when asked, once", async () => {
    const ball = validateSpec(good).spec as VoxelSpec;
    const project = createProject("20261106-0900", "generate", { spec: ball, prompt: "" }, new Date(2026, 10, 6, 9), {
      refs: ["1.png"],
    });
    useProjectStore.setState({ project, editing: true, refs: [{ ...ref("a"), name: "1.png" }] });
    replies(good, good);
    store.setState({ description: "再高一点" });
    await store.getState().generate();
    expect(generateCalls()[0]?.images).toEqual([]);

    store.getState().setAttach(true);
    expect(store.getState().attachFor).toBe("20261106-0900");
    store.setState({ description: "按图再改" });
    await store.getState().generate();
    expect(generateCalls()[1]?.images).toEqual([ref("a")]);
    expect(useProjectStore.getState().project?.versions[2]?.attached).toBe(true);
    expect(store.getState().attachFor).toBeNull();
    // Attaching for a new project is a separate switch.
    expect(store.getState().attach).toBe(true);
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
    store.setState({ description: "一个篮球" });
    replies({ name: "x" }, { name: "x" });
    await store.getState().generate();
    expect(saveCalls()).toHaveLength(0);
    expect(useModelStore.getState().spec).toBeNull();
    expect(store.getState().phase).toMatchObject({ step: "done", retried: true });
  });

  it("makes a new project while another one is only shown", async () => {
    const ball = validateSpec(good).spec as VoxelSpec;
    const shown = createProject("20261106-0900", "generate", { spec: ball, prompt: "" }, new Date(2026, 10, 6, 9));
    useProjectStore.setState({ project: shown, editing: false });
    store.setState({ description: "一个篮球" });
    replies(good);
    await store.getState().generate();
    expect(generateCalls()[0]?.text).toBe("一个篮球");
    expect(useProjectStore.getState().project?.id).not.toBe("20261106-0900");
    expect(useProjectStore.getState().editing).toBe(false);
  });

  describe("with a project being edited", () => {
    const ball = validateSpec(good).spec as VoxelSpec;
    const open = () => {
      const project = createProject(
        "20261106-0900",
        "generate",
        { spec: ball, prompt: "一个篮球" },
        new Date(2026, 10, 6, 9),
      );
      useProjectStore.setState({ project: { ...project, style: "chibi" }, editing: true });
    };
    const bigger = { ...ball, size: [30, 30, 30] };

    it("edits the current version in the project's style", async () => {
      open();
      store.setState({ description: "再大一点" });
      replies(bigger);
      await store.getState().generate();
      const [call] = generateCalls() as unknown as { text: string; style: string }[];
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
