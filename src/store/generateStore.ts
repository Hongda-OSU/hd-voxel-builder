import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { buildModel } from "../core/buildModel";
import { checkGrid, validateSpec } from "../core/spec";
import type { Style } from "../core/types";
import { useModelStore } from "./modelStore";

export type Model = "opus" | "sonnet";
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

/** An ASCII name for the exported file until projects are saved, e.g. model-1105-1043. */
export function modelId(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `model-${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}`;
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
      useModelStore.getState().loadSpec(spec, modelId(new Date(startedAt)));
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      set({ phase: { step: "done", seconds, retried: problems.length > 0 } });
    } catch (error) {
      set({ phase: { step: "error", message: String(error) } });
    }
  },
  cancel: async () => {
    if (get().phase.step === "generating") await invoke("cancel_generation");
  },
}));
