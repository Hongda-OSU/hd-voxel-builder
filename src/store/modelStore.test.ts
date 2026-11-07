import { beforeEach, describe, expect, it } from "vitest";
import { examples } from "../prompts/examples";
import { DEFAULT_CAMERA, PITCH_MAX, ZOOM_LIMITS } from "../render/viewport";
import { useModelStore } from "./modelStore";

const store = useModelStore;

describe("modelStore", () => {
  beforeEach(() =>
    store.setState({
      spec: null,
      modelId: null,
      grid: null,
      issues: [],
      selectedPart: null,
      buildProgress: null,
      camera: DEFAULT_CAMERA,
    }),
  );

  it("bundles the avatar example", () => {
    expect(examples.map((e) => e.id)).toContain("hd");
  });

  it("loads a valid spec with its issues", () => {
    store.getState().loadSpec(examples.find((e) => e.id === "hd")?.data, "hd");
    const { spec, modelId, grid, issues } = store.getState();
    expect([spec?.name, modelId]).toEqual(["hd", "hd"]);
    expect(grid?.cells.filter(Boolean)).toHaveLength(2167);
    expect(issues.map((i) => i.kind)).toEqual(["style"]);
  });

  it("clears the model for an invalid shape", () => {
    store.getState().loadSpec(examples[0]?.data);
    store.getState().togglePart(2);
    store.getState().loadSpec({ name: "broken" }, "broken");
    const { spec, modelId, grid, issues, selectedPart } = store.getState();
    expect([spec, modelId, grid, selectedPart]).toEqual([null, null, null, null]);
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

  it("runs the build from 0 to 1 and stops on a new model", () => {
    const hd = examples.find((e) => e.id === "hd")?.data;
    store.getState().startBuild();
    expect(store.getState().buildProgress).toBeNull();
    store.getState().loadSpec(hd, "hd");
    store.getState().togglePart(2);
    store.getState().startBuild();
    expect(store.getState()).toMatchObject({ buildProgress: 0, selectedPart: null });
    store.getState().setBuildProgress(0.4);
    expect(store.getState().buildProgress).toBe(0.4);
    store.getState().setBuildProgress(3);
    expect(store.getState().buildProgress).toBe(1);
    store.getState().setBuildProgress(-1);
    expect(store.getState().buildProgress).toBe(0);
    store.getState().loadSpec(hd, "hd");
    expect(store.getState().buildProgress).toBeNull();
    store.getState().startBuild();
    store.getState().stopBuild();
    expect(store.getState().buildProgress).toBeNull();
  });
});
