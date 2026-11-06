import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { buildModel } from "../core/buildModel";
import { currentVersion } from "../core/project";
import type { ModelName } from "../core/project";
import { MAX_REFS, appendDraft, draftStyle } from "../core/refs";
import type { RefImage } from "../core/refs";
import { checkGrid, validateSpec } from "../core/spec";
import type { Style, VoxelSpec } from "../core/types";
import { prepareImage } from "../render/refImage";
import { useModelStore } from "./modelStore";
import { useProjectStore } from "./projectStore";

export type Model = ModelName;
export type ClaudeStatus = "unknown" | "ready" | "missing" | "loggedOut";

export type GeneratePhase =
  | { step: "idle" }
  /** `editing` is true when the request changes the open project instead of starting one. */
  | { step: "generating"; attempt: 1 | 2; startedAt: number; editing: boolean }
  /** `id` is the model it produced, so the note can hide once another model is shown. */
  | { step: "done"; seconds: number; retried: boolean; id: string | null; editing: boolean }
  /** Claude is drafting a description from the reference images. */
  | { step: "describing"; startedAt: number }
  | { step: "described" }
  | { step: "error"; message: string };

/** True while a request to Claude is running; the composer and versions wait. */
export const isBusy = (phase: GeneratePhase) => phase.step === "generating" || phase.step === "describing";

interface GenerateState {
  style: Style;
  description: string;
  model: Model;
  claude: ClaudeStatus;
  phase: GeneratePhase;
  /** Reference images for the next new project. */
  refs: RefImage[];
  /** Whether a new project's request carries `refs`; on unless turned off. */
  attach: boolean;
  /** The project whose edits carry its own reference images; off for every other one. */
  attachFor: string | null;
  setStyle: (style: Style) => void;
  setDescription: (description: string) => void;
  setModel: (model: Model) => void;
  checkClaude: () => Promise<void>;
  /**
   * Generates a new project, or edits the open one, then validates and retries
   * once with the problems listed.
   */
  generate: () => Promise<void>;
  cancel: () => Promise<void>;
  /** Shrinks and adds dropped or pasted images, up to MAX_REFS. */
  addRefs: (files: Blob[]) => Promise<void>;
  removeRef: (index: number) => void;
  /** Turns attaching on or off: for the open project's edits, or for a new project. */
  setAttach: (on: boolean) => void;
  /** Drafts a description from `refs` and puts it after what is typed. */
  describe: () => Promise<void>;
}

const send = (images: RefImage[]) => images.map(({ mediaType, data }) => ({ mediaType, data }));

/** An edit request: the instruction plus the complete spec it applies to. */
export function editPrompt(instruction: string, spec: VoxelSpec): string {
  return ["Edit request:", instruction, "", "Current spec:", JSON.stringify(spec)].join("\n");
}

/** Error-level problems, which earn one retry; warnings do not. */
export function blockingIssues(input: unknown): string[] {
  const { spec, issues } = validateSpec(input);
  const all = spec ? [...issues, ...checkGrid(spec, buildModel(spec))] : issues;
  return all.filter((issue) => issue.level === "error").map((issue) => issue.message);
}

/** The retry request: the original description, the problems, and the spec to fix. */
export function retryPrompt(description: string, previous: unknown, problems: string[]): string {
  return [
    description,
    "",
    "Your previous spec had these problems. Return the complete corrected spec;",
    "change only what the problems need and keep every other part, name and order.",
    ...problems.map((problem) => `- ${problem}`),
    "",
    "Previous spec:",
    JSON.stringify(previous),
  ].join("\n");
}

export const useGenerateStore = create<GenerateState>((set, get) => ({
  style: "chibi",
  description: "",
  model: "opus",
  claude: "unknown",
  phase: { step: "idle" },
  refs: [],
  attach: true,
  attachFor: null,
  setStyle: (style) => set({ style }),
  setDescription: (description) => set({ description }),
  setModel: (model) => set({ model }),
  checkClaude: async () => {
    try {
      set({ claude: await invoke<Exclude<ClaudeStatus, "unknown">>("claude_status") });
    } catch {
      set({ claude: "missing" });
    }
  },
  generate: async () => {
    const { description, model, phase, refs, attach, attachFor } = get();
    const text = description.trim();
    if (!text || isBusy(phase)) return;
    // With a project open, the composer edits its current version in the project's own style.
    const { project, refs: projectRefs } = useProjectStore.getState();
    const base = project ? currentVersion(project) : undefined;
    const editing = base !== undefined;
    const request = base ? editPrompt(text, base.spec) : text;
    const style = project?.style ?? get().style;
    // Edits leave the images out unless asked; a new project sends them unless asked not to.
    const images = send(editing ? (attachFor === project?.id ? projectRefs : []) : attach ? refs : []);
    const startedAt = Date.now();
    set({ phase: { step: "generating", attempt: 1, startedAt, editing } });
    try {
      let spec = await invoke<unknown>("generate", { text: request, style, model, images });
      const problems = blockingIssues(spec);
      if (problems.length > 0) {
        set({ phase: { step: "generating", attempt: 2, startedAt, editing } });
        spec = await invoke<unknown>("generate", { text: retryPrompt(request, spec, problems), style, model, images });
      }
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      const retried = problems.length > 0;
      const valid = validateSpec(spec).spec;
      const attached = images.length > 0;
      const input = valid ? { spec: valid, prompt: text, model, seconds, retried, attached } : undefined;
      if (input && editing) {
        await useProjectStore.getState().addEdit(input);
        set({ attachFor: null });
      } else if (input) {
        // A buildable result becomes a saved project, even with content problems left. The
        // images are kept with it even when not sent, so later edits can attach them.
        await useProjectStore.getState().createFromGeneration(input, new Date(startedAt), refs);
        set({ refs: [], attach: true });
      } else if (editing) {
        // Keep the version on screen; a broken edit is not worth a version.
        set({ phase: { step: "error", message: "修改结果的格式不对，没有保存；可以换个说法再试" } });
        return;
      } else {
        // A broken shape shows its problems but has nothing worth saving.
        useProjectStore.getState().close();
        useModelStore.getState().loadSpec(spec);
      }
      // Like a chat input: a sent description is cleared; a failed one stays to retry.
      const id = useModelStore.getState().modelId;
      set({ phase: { step: "done", seconds, retried, id, editing }, description: "" });
    } catch (error) {
      set({ phase: { step: "error", message: String(error) } });
    }
  },
  cancel: async () => {
    if (isBusy(get().phase)) await invoke("cancel_generation");
  },
  addRefs: async (files) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    const room = MAX_REFS - get().refs.length;
    try {
      const prepared = await Promise.all(images.slice(0, Math.max(0, room)).map(prepareImage));
      set((state) => ({ refs: [...state.refs, ...prepared].slice(0, MAX_REFS) }));
      if (images.length > room) set({ phase: { step: "error", message: `最多 ${MAX_REFS} 张参考图` } });
    } catch {
      set({ phase: { step: "error", message: "有一张图打不开，换成 PNG 或 JPG 再试" } });
    }
  },
  removeRef: (index) => set((state) => ({ refs: state.refs.filter((_, i) => i !== index) })),
  setAttach: (on) => {
    const project = useProjectStore.getState().project;
    if (project) set({ attachFor: on ? project.id : null });
    else set({ attach: on });
  },
  describe: async () => {
    const { refs, model, phase } = get();
    if (refs.length === 0 || isBusy(phase)) return;
    set({ phase: { step: "describing", startedAt: Date.now() } });
    try {
      const draft = await invoke<string>("describe", { model, images: send(refs) });
      const style = draftStyle(draft);
      set((state) => ({
        description: appendDraft(state.description, draft),
        ...(style ? { style } : {}),
        phase: { step: "described" },
      }));
    } catch (error) {
      set({ phase: { step: "error", message: String(error) } });
    }
  },
}));
