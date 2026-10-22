import { beforeEach, describe, expect, it } from "vitest";
import { examples } from "../prompts/examples";
import { DEFAULT_CAMERA, PITCH_MAX, ZOOM_LIMITS } from "../render/viewport";
import { useModelStore } from "./modelStore";

const store = useModelStore;

describe("modelStore", () => {
  beforeEach(() => store.setState({ spec: null, grid: null, issues: [], selectedPart: null, camera: DEFAULT_CAMERA }));

  it("bundles the avatar example", () => {
    expect(examples.map((e) => e.id)).toContain("hd");
  });

  it("loads a valid spec with its issues", () => {
    store.getState().loadSpec(examples.find((e) => e.id === "hd")?.data);
    const { spec, grid, issues } = store.getState();
    expect(spec?.name).toBe("hd");
    expect(grid?.cells.filter(Boolean)).toHaveLength(2167);
    expect(issues.map((i) => i.kind)).toEqual(["style"]);
  });

  it("clears the model for an invalid shape", () => {
    store.getState().loadSpec(examples[0]?.data);
    store.getState().togglePart(2);
    store.getState().loadSpec({ name: "broken" });
    const { spec, grid, issues, selectedPart } = store.getState();
    expect([spec, grid, selectedPart]).toEqual([null, null, null]);
    expect(issues.every((i) => i.kind === "schema")).toBe(true);
  });

  it("toggles part selection", () => {
    store.getState().togglePart(3);
    expect(store.getState().selectedPart).toBe(3);
    store.getState().togglePart(3);
    expect(store.getState().selectedPart).toBeNull();
  });

  it("orbits freely in yaw and clamps pitch", () => {
    store.getState().orbit(10, 10);
    expect(store.getState().camera.yaw).toBeCloseTo(DEFAULT_CAMERA.yaw + 10);
    expect(store.getState().camera.pitch).toBe(PITCH_MAX);
    store.getState().orbit(0, -20);
    expect(store.getState().camera.pitch).toBe(0);
  });

  it("clamps zoom, applies presets and resets", () => {
    store.getState().zoomBy(100);
    expect(store.getState().camera.zoom).toBe(ZOOM_LIMITS.max);
    store.getState().pan(5, -3);
    store.getState().setView("top");
    const { camera } = store.getState();
    expect([camera.yaw, camera.pitch, camera.panX, camera.panY]).toEqual([0, PITCH_MAX, 5, -3]);
    store.getState().resetCamera();
    expect(store.getState().camera).toEqual(DEFAULT_CAMERA);
  });
});
