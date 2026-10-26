import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { writeVox } from "../core/voxFile";
import { useModelStore } from "./modelStore";

export type ExportStep =
  | { step: "idle" }
  | { step: "working" }
  /** Written, and MagicaVoxel is running: restarting drops its unsaved work. */
  | { step: "confirm"; file: string }
  | { step: "done"; file: string; restarted: boolean }
  | { step: "error"; message: string };

interface ExportState {
  state: ExportStep;
  /** Writes the current model into MagicaVoxel's list, then restarts it or asks first. */
  send: () => Promise<void>;
  /** After confirming: restarts MagicaVoxel so its list shows the file. */
  restart: () => Promise<void>;
  /** After declining: keeps MagicaVoxel as it is; the file shows up on its next start. */
  keep: () => void;
  reset: () => void;
}

const failed = (error: unknown): ExportStep => ({ step: "error", message: String(error) });

export const useExportStore = create<ExportState>((set, get) => {
  async function restartWith(file: string) {
    set({ state: { step: "working" } });
    try {
      await invoke("restart_magicavoxel", { file });
      set({ state: { step: "done", file, restarted: true } });
    } catch (error) {
      set({ state: failed(error) });
    }
  }

  return {
    state: { step: "idle" },
    send: async () => {
      const { spec, grid, modelId } = useModelStore.getState();
      if (!spec || !grid || !modelId || get().state.step === "working") return;
      set({ state: { step: "working" } });
      try {
        const bytes = Array.from(writeVox(spec, grid));
        const file = await invoke<string>("write_to_magicavoxel", { id: modelId, bytes });
        if (await invoke<boolean>("magicavoxel_running")) {
          set({ state: { step: "confirm", file } });
        } else {
          await restartWith(file);
        }
      } catch (error) {
        set({ state: failed(error) });
      }
    },
    restart: async () => {
      const { state } = get();
      if (state.step === "confirm") await restartWith(state.file);
    },
    keep: () => {
      const { state } = get();
      if (state.step === "confirm") set({ state: { step: "done", file: state.file, restarted: false } });
    },
    reset: () => set({ state: { step: "idle" } }),
  };
});
