import { beforeEach, describe, expect, it } from "vitest";
import { examples } from "../prompts/examples";
import { useModelStore } from "./modelStore";

const store = useModelStore;

describe("modelStore", () => {
  beforeEach(() => store.setState({ spec: null, grid: null, issues: [], selectedPart: null, rotation: 0 }));

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

  it("wraps rotation both ways", () => {
    store.getState().rotate(-1);
    expect(store.getState().rotation).toBe(3);
    store.getState().rotate(1);
    expect(store.getState().rotation).toBe(0);
  });
});
