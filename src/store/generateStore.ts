import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { buildModel } from "../core/buildModel";
import { currentVersion } from "../core/project";
import type { ModelName } from "../core/project";
import { checkGrid, validateSpec } from "../core/spec";
import type { Style, VoxelSpec } from "../core/types";
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
  | { step: "error"; message: string };

interface GenerateState {
  style: Style;
  description: string;
  model: Model;
  claude: ClaudeStatus;
  phase: GeneratePhase;
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
}

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
    const { description, model, phase } = get();
    const text = description.trim();
    if (!text || phase.step === "generating") return;
    // With a project open, the composer edits its current version in the project's own style.
    const project = useProjectStore.getState().project;
    const base = project ? currentVersion(project) : undefined;
    const editing = base !== undefined;
    const request = base ? editPrompt(text, base.spec) : text;
    const style = project?.style ?? get().style;
    const startedAt = Date.now();
    set({ phase: { step: "generating", attempt: 1, startedAt, editing } });
    try {
      let spec = await invoke<unknown>("generate", { text: request, style, model });
      const problems = blockingIssues(spec);
      if (problems.length > 0) {
        set({ phase: { step: "generating", attempt: 2, startedAt, editing } });
        spec = await invoke<unknown>("generate", { text: retryPrompt(request, spec, problems), style, model });
      }
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      const retried = problems.length > 0;
      const valid = validateSpec(spec).spec;
      const input = valid ? { spec: valid, prompt: text, model, seconds, retried } : undefined;
      if (input && editing) {
        await useProjectStore.getState().addEdit(input);
      } else if (input) {
        // A buildable result becomes a saved project, even with content problems left.
        await useProjectStore.getState().createFromGeneration(input, new Date(startedAt));
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
    if (get().phase.step === "generating") await invoke("cancel_generation");
  },
}));
