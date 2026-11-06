import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { examples } from "../prompts/examples";
import { blockingIssues, retryPrompt, useGenerateStore } from "./generateStore";
import { useModelStore } from "./modelStore";

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
    if (command === "list_projects") return [];
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
  });

  it("loads a valid spec after one call", async () => {
    replies(good);
    await store.getState().generate();
    expect(generateCalls()).toEqual([{ text: "一个篮球", style: "object", model: "opus" }]);
    expect(useModelStore.getState().spec?.name).toBe("篮球");
    expect(useModelStore.getState().modelId).toMatch(/^\d{8}-\d{4}$/);
    expect(saveCalls()).toHaveLength(1);
    expect(store.getState().phase).toMatchObject({ step: "done", retried: false });
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
  });

  it("needs a description", async () => {
    store.setState({ description: "  " });
    await store.getState().generate();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("cancels only while generating", async () => {
    await store.getState().cancel();
    expect(mocked).not.toHaveBeenCalled();
    store.setState({ phase: { step: "generating", attempt: 1, startedAt: 0 } });
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
});
