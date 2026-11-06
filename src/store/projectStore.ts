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
import { base64ToBytes, bytesToBase64, mediaTypeOf, refFileName } from "../core/refs";
import type { RefImage, SavedRef } from "../core/refs";
import type { Style } from "../core/types";
import { writeVox } from "../core/voxFile";
import { validateSpec } from "../core/spec";
import { starterExamples } from "../prompts/examples";
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
  /** The open project's reference images, read from refs/ after it opens. */
  refs: SavedRef[];
  error: string | null;
  refresh: () => Promise<void>;
  open: (id: string) => Promise<void>;
  /** Saves a finished generation, and the reference images it had, as a new project and shows it. */
  createFromGeneration: (input: VersionInput, startedAt: Date, refs?: RefImage[]) => Promise<void>;
  /** Adds the starter projects; the caller makes sure this happens only once. */
  addStarters: () => Promise<void>;
  /** Adds a finished edit to the open project as its new current version. */
  addEdit: (input: VersionInput) => Promise<void>;
  /** Shows another version of the open project; nothing is deleted. */
  select: (n: number) => Promise<void>;
  /** Moves a project to the Trash; the open one gives way to the newest left, or nothing. */
  remove: (id: string) => Promise<void>;
  /** Leaves the open project, e.g. when an example is picked. */
  close: () => void;
  /** Opens a saved reference image of the open project in Preview. */
  openRef: (name: string) => Promise<void>;
}

const newestFirst = (a: ProjectSummary, b: ProjectSummary) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

/** Writes project.json and the current version's .vox, plus new reference images. */
async function save(project: Project, refs: SavedRef[] = []): Promise<void> {
  const version = currentVersion(project);
  if (!version) throw new Error(`没有第 ${project.current} 版`);
  const vox = Array.from(writeVox(version.spec, buildModel(version.spec)));
  const files = refs.map(({ name, data }) => ({ name, bytes: Array.from(base64ToBytes(data)) }));
  await invoke("save_project", { id: project.id, project, vox, refs: files });
}

function show(project: Project): void {
  const version = currentVersion(project);
  if (version) useModelStore.getState().loadSpec(version.spec, project.id);
}

export const useProjectStore = create<ProjectState>((set, get) => {
  // Counts project switches, so a list read that started before one cannot undo it.
  let switches = 0;

  /** Reads the open project's reference images; a slow read never lands on another project. */
  const loadRefs = async (id: string) => {
    try {
      const files = await invoke<{ name: string; bytes: number[] }[]>("load_refs", { id });
      const refs = files.map(({ name, bytes }) => ({ name, mediaType: mediaTypeOf(name), data: bytesToBase64(bytes) }));
      if (get().project?.id === id) set({ refs });
    } catch {
      // Missing images cost only their thumbnails.
    }
  };

  /** Shows a changed project at once, then saves it; a failed save keeps it on screen. */
  const commit = async (project: Project, failure: string, newRefs: SavedRef[] = []) => {
    switches++;
    set(get().project?.id === project.id ? { project } : { project, refs: newRefs });
    show(project);
    try {
      await save(project, newRefs);
      set({ error: null });
      await get().refresh();
    } catch (error) {
      set({ error: `${failure}：${String(error)}` });
    }
  };

  return {
    projects: [],
    project: null,
    refs: [],
    error: null,
    refresh: async () => {
      try {
        const before = switches;
        const projects = await invoke<ProjectSummary[]>("list_projects");
        // A project removed outside the app (say, in Finder) is no longer open; a read
        // that began before the current project was opened says nothing about it.
        const open = get().project;
        const gone =
          before === switches && open !== null && !projects.some((summary) => summary.id === open.id);
        set({ projects: [...projects].sort(newestFirst), error: null, ...(gone ? { project: null, refs: [] } : {}) });
      } catch (error) {
        set({ error: String(error) });
      }
    },
    open: async (id) => {
      try {
        const project = parseProject(await invoke<unknown>("load_project", { id }));
        if (!project) throw new Error(`作品「${id}」的 project.json 格式不对，打不开`);
        switches++;
        set({ project, refs: [], error: null });
        show(project);
        if (project.refs?.length) void loadRefs(id);
      } catch (error) {
        // The list may be stale: reread it, then keep the reason visible.
        const message = error instanceof Error ? error.message : String(error);
        await get().refresh();
        set({ error: message });
      }
    },
    createFromGeneration: async (input, startedAt, images = []) => {
      const id = projectId(startedAt, get().projects.map((summary) => summary.id));
      const refs = images.map((image, index) => ({ ...image, name: refFileName(index, image.mediaType) }));
      const project = createProject(id, "generate", input, new Date(), { refs: refs.map((ref) => ref.name) });
      // Shown first: a failed save must not hide what was just generated.
      await commit(project, "生成好了，但没存下来", refs);
    },
    addStarters: async () => {
      const now = Date.now();
      const ids = get().projects.map((summary) => summary.id);
      const starters: Project[] = [];
      starterExamples.forEach((example, index) => {
        const spec = validateSpec(example.data).spec;
        if (!spec) return;
        const id = projectId(new Date(now), ids);
        ids.push(id);
        // A second apart keeps the newest-first list in starter order.
        starters.push(createProject(id, "example", { spec, prompt: "" }, new Date(now - index * 1000), { from: example.id }));
      });
      try {
        for (const project of starters) await save(project);
      } catch (error) {
        set({ error: `起步作品没能存下来：${String(error)}` });
      }
      await get().refresh();
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
      // Nothing left: an empty canvas; removed starters do not come back.
      set({ project: null, refs: [] });
      useModelStore.getState().clear();
    },
    close: () => set({ project: null, refs: [], error: null }),
    openRef: async (name) => {
      const open = get().project;
      if (!open) return;
      try {
        await invoke("open_ref", { id: open.id, name });
      } catch (error) {
        set({ error: String(error) });
      }
    },
  };
});
