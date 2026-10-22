import { create } from "zustand";
import { buildModel } from "../core/buildModel";
import { checkGrid, validateSpec } from "../core/spec";
import type { Issue } from "../core/spec";
import type { VoxelGrid, VoxelSpec } from "../core/types";
import { DEFAULT_CAMERA, VIEW_PRESETS, clampPitch, clampZoom } from "../render/viewport";
import type { Camera, PresetId } from "../render/viewport";

interface ModelState {
  spec: VoxelSpec | null;
  grid: VoxelGrid | null;
  issues: Issue[];
  /** Highlighted part index. */
  selectedPart: number | null;
  camera: Camera;
  /** Validates and builds external JSON; an invalid shape leaves no model. */
  loadSpec: (input: unknown) => void;
  togglePart: (index: number) => void;
  clearSelection: () => void;
  /** Turns the camera by radians; pitch stays between level and straight down. */
  orbit: (dYaw: number, dPitch: number) => void;
  /** Moves the view by CSS pixels. */
  pan: (dx: number, dy: number) => void;
  zoomBy: (factor: number) => void;
  setView: (preset: PresetId) => void;
  resetCamera: () => void;
}

export const useModelStore = create<ModelState>((set) => ({
  spec: null,
  grid: null,
  issues: [],
  selectedPart: null,
  camera: DEFAULT_CAMERA,
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
  orbit: (dYaw, dPitch) =>
    set(({ camera }) => ({ camera: { ...camera, yaw: camera.yaw + dYaw, pitch: clampPitch(camera.pitch + dPitch) } })),
  pan: (dx, dy) => set(({ camera }) => ({ camera: { ...camera, panX: camera.panX + dx, panY: camera.panY + dy } })),
  zoomBy: (factor) => set(({ camera }) => ({ camera: { ...camera, zoom: clampZoom(camera.zoom * factor) } })),
  setView: (preset) => set(({ camera }) => ({ camera: { ...camera, ...VIEW_PRESETS[preset] } })),
  resetCamera: () => set({ camera: DEFAULT_CAMERA }),
}));
