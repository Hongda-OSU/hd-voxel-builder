import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createProject } from "../core/project";
import { validateSpec } from "../core/spec";
import type { VoxelSpec } from "../core/types";
import { examples } from "../prompts/examples";
import { useModelStore } from "./modelStore";
import { useProjectStore } from "./projectStore";
import type { ProjectSummary } from "./projectStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mocked = vi.mocked(invoke);
const store = useProjectStore;
const basketball = validateSpec(examples.find((e) => e.id === "basketball")?.data).spec as VoxelSpec;
const startedAt = new Date(2026, 10, 5, 14, 32);

const summary = (id: string, updatedAt: string): ProjectSummary => ({
  id,
  name: id,
  style: "object",
  updatedAt,
  current: 1,
  versions: 1,
  spec: basketball,
});

/** Answers each command from `answers`; save_project records what it got. */
function answer(answers: Record<string, unknown>) {
  mocked.mockImplementation(async (command: string) => {
    const reply = answers[command];
    if (reply instanceof Error) throw reply;
    return reply;
  });
}

const saved = () =>
  mocked.mock.calls.filter(([command]) => command === "save_project").map(([, args]) => args as { id: string });

describe("projectStore", () => {
  beforeEach(() => {
    mocked.mockReset();
    store.setState({ projects: [], project: null, error: null });
    useModelStore.getState().loadSpec({ name: "none" });
  });

  it("lists projects newest first across time zones", async () => {
    answer({
      list_projects: [
        summary("old", "2026-11-05T09:00:00-05:00"),
        summary("new", "2026-11-05T15:30:00+01:00"),
        summary("mid", "2026-11-05T08:00:00-08:00"),
      ],
    });
    await store.getState().refresh();
    expect(store.getState().projects.map((p) => p.id)).toEqual(["mid", "new", "old"]);
  });

  it("saves a generation as a new project and shows it", async () => {
    answer({ list_projects: [summary("20261105-1432", "2026-11-05T14:33:00-05:00")] });
    await store.getState().createFromGeneration({ spec: basketball, prompt: "一个篮球", model: "opus" }, startedAt);
    expect(saved().map((call) => call.id)).toEqual(["20261105-1432"]);
    expect(useModelStore.getState().modelId).toBe("20261105-1432");

    // The same minute again gets a suffix, because the list now holds the first one.
    await store.getState().createFromGeneration({ spec: basketball, prompt: "又一个" }, startedAt);
    expect(saved().map((call) => call.id)).toEqual(["20261105-1432", "20261105-1432-2"]);
  });

  it("keeps showing the model when saving fails", async () => {
    answer({ save_project: new Error("磁盘满了") });
    await store.getState().createFromGeneration({ spec: basketball, prompt: "一个篮球" }, startedAt);
    expect(useModelStore.getState().spec?.name).toBe("篮球");
    expect(store.getState().error).toContain("磁盘满了");
  });

  it("opens a saved project at its current version", async () => {
    const project = createProject("20261105-1432", "generate", { spec: basketball, prompt: "" }, startedAt);
    answer({ load_project: JSON.parse(JSON.stringify(project)) });
    await store.getState().open("20261105-1432");
    expect(store.getState().project?.id).toBe("20261105-1432");
    expect(useModelStore.getState().modelId).toBe("20261105-1432");
  });

  it("reports a project.json it cannot read", async () => {
    answer({ load_project: { format: 1 } });
    await store.getState().open("broken");
    expect(store.getState().project).toBeNull();
    expect(store.getState().error).toContain("格式不对");
  });

  it("drops a project deleted outside the app", async () => {
    const project = createProject("20261105-2307", "generate", { spec: basketball, prompt: "" }, startedAt);
    answer({ load_project: JSON.parse(JSON.stringify(project)), list_projects: [summary("20261105-2307", project.updatedAt)] });
    await store.getState().refresh();
    await store.getState().open("20261105-2307");

    answer({ load_project: new Error("读不到作品「20261105-2307」"), list_projects: [] });
    await store.getState().open("20261105-2307");
    expect(store.getState().projects).toEqual([]);
    expect(store.getState().project).toBeNull();
    expect(store.getState().error).toContain("读不到作品");
  });

  it("moves a project to the Trash and opens the newest one left", async () => {
    const kept = createProject("20261105-1000", "generate", { spec: basketball, prompt: "" }, startedAt);
    const gone = createProject("20261105-2307", "generate", { spec: basketball, prompt: "" }, startedAt);
    answer({ load_project: JSON.parse(JSON.stringify(gone)), list_projects: [summary(gone.id, gone.updatedAt), summary(kept.id, kept.updatedAt)] });
    await store.getState().open(gone.id);

    answer({ load_project: JSON.parse(JSON.stringify(kept)), list_projects: [summary(kept.id, kept.updatedAt)] });
    await store.getState().remove(gone.id);
    expect(mocked).toHaveBeenCalledWith("trash_project", { id: gone.id });
    expect(store.getState().projects.map((p) => p.id)).toEqual([kept.id]);
    expect(store.getState().project?.id).toBe(kept.id);
  });

  it("falls back to an example after the last project goes", async () => {
    const only = createProject("20261105-2307", "generate", { spec: basketball, prompt: "" }, startedAt);
    answer({ load_project: JSON.parse(JSON.stringify(only)), list_projects: [] });
    await store.getState().open(only.id);
    await store.getState().remove(only.id);
    expect(store.getState().project).toBeNull();
    expect(useModelStore.getState().modelId).toBe(examples[0]?.id);
  });

  it("keeps the project when the Trash refuses it", async () => {
    answer({ trash_project: new Error("移不到废纸篓") });
    await store.getState().remove("20261105-2307");
    expect(store.getState().error).toContain("移不到废纸篓");
  });

  it("clears the canvas when it shows the removed project, open or not", async () => {
    useModelStore.getState().loadSpec(basketball, "20261105-2307");
    answer({ list_projects: [] });
    await store.getState().remove("20261105-2307");
    expect(useModelStore.getState().modelId).toBe(examples[0]?.id);
  });
});
