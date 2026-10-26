import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

interface SettingsState {
  open: boolean;
  /** MagicaVoxel's own model folder; null when it is not installed. */
  defaultDir: string | null;
  /** The folder the user chose instead; null uses defaultDir. */
  customDir: string | null;
  error: string | null;
  toggle: () => void;
  close: () => void;
  load: () => Promise<void>;
  /** Saves a folder, or null to go back to MagicaVoxel's own. Returns whether it saved. */
  save: (dir: string | null) => Promise<boolean>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  open: false,
  defaultDir: null,
  customDir: null,
  error: null,
  toggle: () => {
    const open = !get().open;
    set({ open, error: null });
    if (open) void get().load();
  },
  close: () => set({ open: false, error: null }),
  load: async () => {
    try {
      const [defaultDir, customDir] = await Promise.all([
        invoke<string | null>("magicavoxel_model_dir"),
        invoke<string | null>("custom_model_dir"),
      ]);
      set({ defaultDir, customDir });
    } catch (error) {
      set({ error: String(error) });
    }
  },
  save: async (dir) => {
    try {
      await invoke("set_custom_model_dir", { dir });
      set({ error: null });
      await get().load();
      return true;
    } catch (error) {
      set({ error: String(error) });
      return false;
    }
  },
}));
