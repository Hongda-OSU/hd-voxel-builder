import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { examples } from "../prompts/examples";
import { useExportStore } from "./exportStore";
import { useModelStore } from "./modelStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mocked = vi.mocked(invoke);
const store = useExportStore;

/** Answers each command; `running` decides whether MagicaVoxel is open. */
function native(running: boolean, fail?: string) {
  mocked.mockImplementation(async (command: string) => {
    if (command === fail) throw `${command} failed`;
    if (command === "write_to_magicavoxel") return "hd.vox";
    if (command === "magicavoxel_running") return running;
    return undefined;
  });
}

const commands = () => mocked.mock.calls.map(([command]) => command);

describe("exportStore", () => {
  beforeEach(() => {
    mocked.mockReset();
    store.getState().reset();
    useModelStore.getState().loadSpec(examples.find((e) => e.id === "hd")?.data, "hd");
  });

  it("writes the model under its id as .vox bytes", async () => {
    native(false);
    await store.getState().send();
    const [, args] = mocked.mock.calls[0] ?? [];
    expect(args).toMatchObject({ id: "hd" });
    const bytes = (args as { bytes: number[] }).bytes;
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("VOX ");
  });

  it("restarts straight away when MagicaVoxel is closed", async () => {
    native(false);
    await store.getState().send();
    expect(commands()).toEqual(["write_to_magicavoxel", "magicavoxel_running", "restart_magicavoxel"]);
    expect(store.getState().state).toEqual({ step: "done", file: "hd.vox", restarted: true });
  });

  it("asks before restarting a running MagicaVoxel", async () => {
    native(true);
    await store.getState().send();
    expect(store.getState().state).toEqual({ step: "confirm", file: "hd.vox" });
    expect(commands()).not.toContain("restart_magicavoxel");

    await store.getState().restart();
    expect(commands()).toContain("restart_magicavoxel");
    expect(store.getState().state).toEqual({ step: "done", file: "hd.vox", restarted: true });
  });

  it("leaves MagicaVoxel alone when the restart is declined", async () => {
    native(true);
    await store.getState().send();
    store.getState().keep();
    expect(commands()).not.toContain("restart_magicavoxel");
    expect(store.getState().state).toEqual({ step: "done", file: "hd.vox", restarted: false });
  });

  it("shows the native error", async () => {
    native(false, "restart_magicavoxel");
    await store.getState().send();
    expect(store.getState().state).toEqual({ step: "error", message: "restart_magicavoxel failed" });
  });

  it("does nothing without a model", async () => {
    useModelStore.getState().loadSpec({ name: "broken" });
    await store.getState().send();
    expect(mocked).not.toHaveBeenCalled();
  });
});
