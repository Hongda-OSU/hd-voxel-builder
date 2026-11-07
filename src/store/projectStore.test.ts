import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createProject } from "../core/project";
import { validateSpec } from "../core/spec";
import type { VoxelSpec } from "../core/types";
import { examples, starterExamples } from "../prompts/examples";
import { useModelStore } from "./modelStore";
import { launchProject, useProjectStore } from "./projectStore";
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
    store.setState({ projects: [], project: null, editing: false, refs: [], error: null });
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

  it("saves reference images with a new project as numbered files", async () => {
    answer({ list_projects: [summary("20261105-1432", "2026-11-05T14:33:00-05:00")] });
    const images = [
      { mediaType: "image/jpeg" as const, data: btoa("JPG") },
      { mediaType: "image/png" as const, data: btoa("PNG") },
    ];
    await store.getState().createFromGeneration({ spec: basketball, prompt: "邮筒" }, startedAt, images);
    const [call] = mocked.mock.calls.filter(([command]) => command === "save_project");
    const args = call?.[1] as { project: { refs: string[] }; refs: { name: string; bytes: number[] }[] };
    expect(args.project.refs).toEqual(["1.jpg", "2.png"]);
    expect(args.refs).toEqual([
      { name: "1.jpg", bytes: [74, 80, 71] },
      { name: "2.png", bytes: [80, 78, 71] },
    ]);
    expect(store.getState().refs.map((ref) => ref.name)).toEqual(["1.jpg", "2.png"]);
  });

  it("reads an opened project's reference images", async () => {
    const project = createProject("20261105-1432", "generate", { spec: basketball, prompt: "" }, startedAt, {
      refs: ["1.png"],
    });
    answer({ load_project: JSON.parse(JSON.stringify(project)), load_refs: [{ name: "1.png", bytes: [80, 78, 71] }] });
    await store.getState().open("20261105-1432");
    await vi.waitFor(() => expect(store.getState().refs).toHaveLength(1));
    expect(store.getState().refs[0]).toEqual({ name: "1.png", mediaType: "image/png", data: btoa("PNG") });
    // Leaving the edit keeps the project, and its images, on screen.
    store.getState().close();
    expect(store.getState().refs).toHaveLength(1);
    store.getState().unload();
    expect(store.getState().refs).toEqual([]);
  });

  it("drops reference images that arrive after another project opened", async () => {
    const withRefs = createProject("a", "generate", { spec: basketball, prompt: "" }, startedAt, { refs: ["1.png"] });
    const other = createProject("b", "generate", { spec: basketball, prompt: "" }, startedAt);
    let release: (files: unknown) => void = () => {};
    mocked.mockImplementation(async (command: string, args?: unknown) => {
      if (command === "load_project")
        return JSON.parse(JSON.stringify((args as { id: string }).id === "a" ? withRefs : other));
      if (command === "load_refs") return new Promise((resolve) => (release = resolve));
      return undefined;
    });
    await store.getState().open("a");
    await store.getState().open("b");
    release([{ name: "1.png", bytes: [1] }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getState().project?.id).toBe("b");
    expect(store.getState().refs).toEqual([]);
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
    answer({
      load_project: JSON.parse(JSON.stringify(project)),
      list_projects: [summary("20261105-2307", project.updatedAt)],
    });
    await store.getState().refresh();
    await store.getState().open("20261105-2307");

    answer({ load_project: new Error("读不到作品「20261105-2307」"), list_projects: [] });
    await store.getState().open("20261105-2307");
    expect(store.getState().projects).toEqual([]);
    expect(store.getState().project).toBeNull();
    expect(store.getState().error).toContain("读不到作品");
  });

  it("moves a project to the Trash and stays on the list", async () => {
    const kept = createProject("20261105-1000", "generate", { spec: basketball, prompt: "" }, startedAt);
    const gone = createProject("20261105-2307", "generate", { spec: basketball, prompt: "" }, startedAt);
    answer({
      load_project: JSON.parse(JSON.stringify(gone)),
      list_projects: [summary(gone.id, gone.updatedAt), summary(kept.id, kept.updatedAt)],
    });
    await store.getState().open(gone.id);

    answer({ load_project: JSON.parse(JSON.stringify(kept)), list_projects: [summary(kept.id, kept.updatedAt)] });
    await store.getState().remove(gone.id);
    expect(mocked).toHaveBeenCalledWith("trash_project", { id: gone.id });
    expect(store.getState().projects.map((p) => p.id)).toEqual([kept.id]);
    expect(store.getState().project).toBeNull();
    expect(useModelStore.getState().spec).toBeNull();
  });

  it("leaves the canvas alone when another project is removed", async () => {
    useModelStore.getState().loadSpec(basketball, "20261105-1000");
    answer({ list_projects: [] });
    await store.getState().remove("20261105-2307");
    expect(useModelStore.getState().modelId).toBe("20261105-1000");
  });

  it("leaves an empty canvas after the last project goes", async () => {
    const only = createProject("20261105-2307", "generate", { spec: basketball, prompt: "" }, startedAt);
    answer({ load_project: JSON.parse(JSON.stringify(only)), list_projects: [] });
    await store.getState().open(only.id);
    await store.getState().remove(only.id);
    expect(saved()).toHaveLength(0);
    expect(store.getState().project).toBeNull();
    expect(useModelStore.getState().spec).toBeNull();
    expect(useModelStore.getState().issues).toEqual([]);
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
    expect(useModelStore.getState().spec).toBeNull();
  });

  it("adds an edit as the current version and saves it", async () => {
    const project = createProject("20261106-0900", "generate", { spec: basketball, prompt: "一个篮球" }, startedAt);
    store.setState({ project });
    answer({ list_projects: [summary(project.id, project.updatedAt)] });
    const longer = { ...basketball, size: [28, 30, 28] as VoxelSpec["size"] };
    await store.getState().addEdit({ spec: longer, prompt: "再长一点", model: "opus", seconds: 30 });
    expect(store.getState().project?.current).toBe(2);
    expect(useModelStore.getState().spec?.size).toEqual([28, 30, 28]);
    expect(saved()).toHaveLength(1);
  });

  it("switches versions without deleting any", async () => {
    const first = createProject("20261106-0900", "generate", { spec: basketball, prompt: "" }, startedAt);
    store.setState({ project: first });
    answer({ list_projects: [summary(first.id, first.updatedAt)] });
    const longer = { ...basketball, size: [28, 30, 28] as VoxelSpec["size"] };
    await store.getState().addEdit({ spec: longer, prompt: "再长一点" });
    await store.getState().select(1);
    expect(store.getState().project?.current).toBe(1);
    expect(store.getState().project?.versions).toHaveLength(2);
    expect(useModelStore.getState().spec?.size).toEqual(basketball.size);
    expect(saved()).toHaveLength(2);

    // Picking the version already shown saves nothing.
    await store.getState().select(1);
    expect(saved()).toHaveLength(2);
  });

  it("adds the starters as ordinary projects", async () => {
    answer({ list_projects: [] });
    await store.getState().addStarters();
    const projects = mocked.mock.calls
      .filter(([command]) => command === "save_project")
      .map(([, args]) => (args as { project: { id: string; from: string; updatedAt: string } }).project);
    expect(projects.map((p) => p.from)).toEqual(["basketball", "volvo"]);
    expect(starterExamples.map((e) => e.id)).toEqual(["basketball", "volvo"]);
    expect(new Set(projects.map((p) => p.id)).size).toBe(2);
    // The first starter is the newest, so it heads the list.
    expect(Date.parse(projects[0]!.updatedAt)).toBeGreaterThan(Date.parse(projects[1]!.updatedAt));
  });

  it("keeps a project opened while an older list read was on its way", async () => {
    const project = createProject("20261106-1117", "generate", { spec: basketball, prompt: "" }, startedAt);
    let release: (value: ProjectSummary[]) => void = () => {};
    mocked.mockImplementation(async (command: string) => {
      if (command === "list_projects") return new Promise<ProjectSummary[]>((resolve) => (release = resolve));
      if (command === "load_project") return JSON.parse(JSON.stringify(project)) as unknown;
      return undefined;
    });
    const stale = store.getState().refresh();
    await store.getState().open(project.id);
    release([]);
    await stale;
    expect(store.getState().project?.id).toBe(project.id);
  });
});

describe("browsing and editing", () => {
  const ball = createProject("20261106-0900", "generate", { spec: basketball, prompt: "" }, startedAt);
  const car = createProject("20261106-0901", "generate", { spec: basketball, prompt: "" }, startedAt);

  beforeEach(() => {
    mocked.mockReset();
    mocked.mockImplementation(async (command: string, args?: unknown) => {
      if (command === "load_project")
        return JSON.parse(JSON.stringify((args as { id: string }).id === ball.id ? ball : car));
      if (command === "list_projects") return [summary(ball.id, ball.updatedAt), summary(car.id, car.updatedAt)];
      return undefined;
    });
    store.setState({ projects: [], project: null, editing: false, refs: [], error: null });
  });

  it("shows a chosen project without editing it", async () => {
    await store.getState().open(ball.id);
    expect(store.getState()).toMatchObject({ project: { id: ball.id }, editing: false });
    expect(useModelStore.getState().modelId).toBe(ball.id);
  });

  it("edits only when asked, and choosing another project stops editing", async () => {
    await store.getState().open(ball.id);
    await store.getState().edit(ball.id);
    expect(store.getState().editing).toBe(true);
    await store.getState().open(car.id);
    expect(store.getState()).toMatchObject({ project: { id: car.id }, editing: false });
  });

  it("opens and edits in one go, as a double-click does", async () => {
    await store.getState().edit(car.id);
    expect(store.getState()).toMatchObject({ project: { id: car.id }, editing: true });
  });

  it("keeps the project on the canvas when editing stops", async () => {
    await store.getState().edit(ball.id);
    store.getState().close();
    expect(store.getState()).toMatchObject({ project: { id: ball.id }, editing: false });
    expect(useModelStore.getState().modelId).toBe(ball.id);
  });
});

describe("launchProject", () => {
  const list = [summary("new", "2026-11-06T10:00:00-06:00"), summary("old", "2026-11-05T10:00:00-06:00")];

  it("reopens the project left open", () => {
    expect(launchProject("old", list)).toBe("old");
  });

  it("opens the newest when the list was showing, nothing is known or the project is gone", () => {
    expect(launchProject("", list)).toBe("new");
    expect(launchProject(null, list)).toBe("new");
    expect(launchProject("deleted", list)).toBe("new");
    expect(launchProject(null, [])).toBeNull();
  });
});
