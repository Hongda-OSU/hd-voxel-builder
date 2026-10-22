import { create } from "zustand";
import { buildModel } from "../core/buildModel";
import { checkGrid, validateSpec } from "../core/spec";
import type { Issue } from "../core/spec";
import type { VoxelGrid, VoxelSpec } from "../core/types";
import type { Rotation } from "../render/iso";

interface ModelState {
  spec: VoxelSpec | null;
  grid: VoxelGrid | null;
  issues: Issue[];
  /** Highlighted part index. */
  selectedPart: number | null;
  rotation: Rotation;
  /** Validates and builds external JSON; an invalid shape leaves no model. */
  loadSpec: (input: unknown) => void;
  togglePart: (index: number) => void;
  clearSelection: () => void;
  rotate: (turns: 1 | -1) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  spec: null,
  grid: null,
  issues: [],
  selectedPart: null,
  rotation: 0,
  loadSpec: (input) => {
    const { spec, issues } = validateSpec(input);
    if (!spec) {
      set({ spec: null, grid: null, issues, selectedPart: null });
      return;
    }
    const grid = buildModel(spec);
    set({ spec, grid, issues: [...issues, ...checkGrid(spec, grid)], selectedPart: null });
  },
  togglePart: (index) => set((state) => ({ selectedPart: state.selectedPart === index ? null : index })),
  clearSelection: () => set({ selectedPart: null }),
  rotate: (turns) => set((state) => ({ rotation: ((state.rotation + turns + 4) % 4) as Rotation })),
}));
