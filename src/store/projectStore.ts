import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { buildModel } from "../core/buildModel";
import {
  addEdit as appendEdit,
  createProject,
  currentVersion,
  parseProject,
  projectId,
  setCurrent,
} from "../core/project";
import type { Project, VersionInput } from "../core/project";
import type { Style } from "../core/types";
import { writeVox } from "../core/voxFile";
import { examples } from "../prompts/examples";
import { useModelStore } from "./modelStore";

/** One row of the project list, as list_projects returns it. */
export interface ProjectSummary {
  id: string;
  name: string;
  style: Style;
  updatedAt: string;
  current: number;
  versions: number;
  /** The current version's spec, unvalidated. */
  spec: unknown;
}

interface ProjectState {
  /** Newest first. */
  projects: ProjectSummary[];
  /** The open project; null while an example or nothing is shown. */
  project: Project | null;
  error: string | null;
  refresh: () => Promise<void>;
  open: (id: string) => Promise<void>;
  /** Saves a finished generation as a new project and shows it. */
  createFromGeneration: (input: VersionInput, startedAt: Date) => Promise<void>;
  /** Adds a finished edit to the open project as its new current version. */
  addEdit: (input: VersionInput) => Promise<void>;
  /** Shows another version of the open project; nothing is deleted. */
  select: (n: number) => Promise<void>;
  /** Moves a project to the Trash; the open one gives way to the newest left. */
  remove: (id: string) => Promise<void>;
  /** Leaves the open project, e.g. when an example is picked. */
  close: () => void;
}

const newestFirst = (a: ProjectSummary, b: ProjectSummary) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

/** Writes project.json and the current version's .vox. */
async function save(project: Project): Promise<void> {
  const version = currentVersion(project);
  if (!version) throw new Error(`没有第 ${project.current} 版`);
  const vox = Array.from(writeVox(version.spec, buildModel(version.spec)));
  await invoke("save_project", { id: project.id, project, vox });
}

function show(project: Project): void {
  const version = currentVersion(project);
  if (version) useModelStore.getState().loadSpec(version.spec, project.id);
}

export const useProjectStore = create<ProjectState>((set, get) => {
  /** Shows a changed project at once, then saves it; a failed save keeps it on screen. */
  const commit = async (project: Project, failure: string) => {
    set({ project });
    show(project);
    try {
      await save(project);
      set({ error: null });
      await get().refresh();
    } catch (error) {
      set({ error: `${failure}：${String(error)}` });
    }
  };

  return {
    projects: [],
    project: null,
    error: null,
    refresh: async () => {
      try {
        const projects = await invoke<ProjectSummary[]>("list_projects");
        // A project removed outside the app (say, in Finder) is no longer open.
        const open = get().project;
        const gone = open !== null && !projects.some((summary) => summary.id === open.id);
        set({ projects: [...projects].sort(newestFirst), error: null, ...(gone ? { project: null } : {}) });
      } catch (error) {
        set({ error: String(error) });
      }
    },
    open: async (id) => {
      try {
        const project = parseProject(await invoke<unknown>("load_project", { id }));
        if (!project) throw new Error(`作品「${id}」的 project.json 格式不对，打不开`);
        set({ project, error: null });
        show(project);
      } catch (error) {
        // The list may be stale: reread it, then keep the reason visible.
        const message = error instanceof Error ? error.message : String(error);
        await get().refresh();
        set({ error: message });
      }
    },
    createFromGeneration: async (input, startedAt) => {
      const id = projectId(startedAt, get().projects.map((summary) => summary.id));
      const project = createProject(id, "generate", input, new Date());
      // Show it first: a failed save must not hide what was just generated.
      set({ project });
      show(project);
      try {
        await save(project);
        set({ error: null });
        await get().refresh();
      } catch (error) {
        set({ error: `生成好了，但没存下来：${String(error)}` });
      }
    },
    addEdit: async (input) => {
      const open = get().project;
      if (!open) return;
      await commit(appendEdit(open, input, new Date()), "改好了，但没存下来");
    },
    select: async (n) => {
      const open = get().project;
      if (!open || open.current === n) return;
      await commit(setCurrent(open, n, new Date()), "切过去了，但没存下来");
    },
    remove: async (id) => {
      try {
        await invoke("trash_project", { id });
      } catch (error) {
        set({ error: String(error) });
        return;
      }
      // The canvas may show it even when no project is marked open (say, after a reload).
      const wasOpen = get().project?.id === id || useModelStore.getState().modelId === id;
      await get().refresh();
      if (!wasOpen) return;
      const newest = get().projects[0];
      if (newest) return get().open(newest.id);
      set({ project: null });
      const first = examples[0];
      if (first) useModelStore.getState().loadSpec(first.data, first.id);
    },
    close: () => set({ project: null, error: null }),
  };
});
