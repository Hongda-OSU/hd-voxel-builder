import { create } from "zustand";
import { buildModel } from "../core/buildModel";
import { checkGrid, validateSpec } from "../core/spec";
import type { Issue } from "../core/spec";
import type { VoxelGrid, VoxelSpec } from "../core/types";
import { DEFAULT_CAMERA, VIEW_PRESETS, clampPitch, clampZoom } from "../render/viewport";
import type { Camera, PresetId } from "../render/viewport";

/** The build animation's length, whatever the model's size. */
export const BUILD_MS = 4000;

interface ModelState {
  spec: VoxelSpec | null;
  /** Names the exported file; null for an invalid spec. */
  modelId: string | null;
  grid: VoxelGrid | null;
  issues: Issue[];
  /** Highlighted part index. */
  selectedPart: number | null;
  /** How far the build animation has got, 0 to 1; null shows the whole model. */
  buildProgress: number | null;
  camera: Camera;
  /** Validates and builds external JSON; an invalid shape leaves no model. */
  loadSpec: (input: unknown, id?: string) => void;
  togglePart: (index: number) => void;
  clearSelection: () => void;
  /** Starts the build animation from an empty floor. */
  startBuild: () => void;
  /** Moves the build animation to a point between 0 (empty floor) and 1 (built). */
  setBuildProgress: (progress: number) => void;
  /** Ends the build animation and shows the whole model. */
  stopBuild: () => void;
  /** Shows nothing, e.g. when no project is left. */
  clear: () => void;
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
  modelId: null,
  grid: null,
  issues: [],
  selectedPart: null,
  buildProgress: null,
  camera: DEFAULT_CAMERA,
  loadSpec: (input, id) => {
    const { spec, issues } = validateSpec(input);
    if (!spec) {
      set({ spec: null, modelId: null, grid: null, issues, selectedPart: null, buildProgress: null });
      return;
    }
    const grid = buildModel(spec);
    set({
      spec,
      modelId: id ?? null,
      grid,
      issues: [...issues, ...checkGrid(spec, grid)],
      selectedPart: null,
      buildProgress: null,
    });
  },
  togglePart: (index) => set((state) => ({ selectedPart: state.selectedPart === index ? null : index })),
  clearSelection: () => set({ selectedPart: null }),
  startBuild: () => set((state) => (state.spec ? { buildProgress: 0, selectedPart: null } : {})),
  setBuildProgress: (progress) =>
    set((state) => (state.spec ? { buildProgress: Math.max(0, Math.min(1, progress)) } : {})),
  stopBuild: () => set({ buildProgress: null }),
  clear: () => set({ spec: null, modelId: null, grid: null, issues: [], selectedPart: null, buildProgress: null }),
  orbit: (dYaw, dPitch) =>
    set(({ camera }) => ({ camera: { ...camera, yaw: camera.yaw + dYaw, pitch: clampPitch(camera.pitch + dPitch) } })),
  pan: (dx, dy) => set(({ camera }) => ({ camera: { ...camera, panX: camera.panX + dx, panY: camera.panY + dy } })),
  zoomBy: (factor) => set(({ camera }) => ({ camera: { ...camera, zoom: clampZoom(camera.zoom * factor) } })),
  setView: (preset) => set(({ camera }) => ({ camera: { ...camera, ...VIEW_PRESETS[preset] } })),
  resetCamera: () => set({ camera: DEFAULT_CAMERA }),
}));
