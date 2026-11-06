import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { buildModel } from "../core/buildModel";
import type { ModelName } from "../core/project";
import { checkGrid, validateSpec } from "../core/spec";
import type { Style } from "../core/types";
import { useModelStore } from "./modelStore";
import { useProjectStore } from "./projectStore";

export type Model = ModelName;
export type ClaudeStatus = "unknown" | "ready" | "missing" | "loggedOut";

export type GeneratePhase =
  | { step: "idle" }
  | { step: "generating"; attempt: 1 | 2; startedAt: number }
  | { step: "done"; seconds: number; retried: boolean }
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
  /** Generates, validates, and retries once with the problems listed. */
  generate: () => Promise<void>;
  cancel: () => Promise<void>;
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
    const { description, style, model, phase } = get();
    const text = description.trim();
    if (!text || phase.step === "generating") return;
    const startedAt = Date.now();
    set({ phase: { step: "generating", attempt: 1, startedAt } });
    try {
      let spec = await invoke<unknown>("generate", { text, style, model });
      const problems = blockingIssues(spec);
      if (problems.length > 0) {
        set({ phase: { step: "generating", attempt: 2, startedAt } });
        spec = await invoke<unknown>("generate", { text: retryPrompt(text, spec, problems), style, model });
      }
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      const retried = problems.length > 0;
      const valid = validateSpec(spec).spec;
      if (valid) {
        // A buildable result becomes a saved project, even with content problems left.
        await useProjectStore
          .getState()
          .createFromGeneration({ spec: valid, prompt: text, model, seconds, retried }, new Date(startedAt));
      } else {
        // A broken shape shows its problems but has nothing worth saving.
        useProjectStore.getState().close();
        useModelStore.getState().loadSpec(spec);
      }
      set({ phase: { step: "done", seconds, retried } });
    } catch (error) {
      set({ phase: { step: "error", message: String(error) } });
    }
  },
  cancel: async () => {
    if (get().phase.step === "generating") await invoke("cancel_generation");
  },
}));
