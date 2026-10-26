import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "./settingsStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mocked = vi.mocked(invoke);
const store = useSettingsStore;
const MAGICAVOXEL = "/Applications/MagicaVoxel/vox";

/** A fake native side that keeps the override in memory. */
function native() {
  let custom: string | null = null;
  mocked.mockImplementation(async (command: string, args?: unknown) => {
    if (command === "magicavoxel_model_dir") return MAGICAVOXEL;
    if (command === "custom_model_dir") return custom;
    if (command === "set_custom_model_dir") {
      const { dir } = args as { dir: string | null };
      if (dir === "/missing") throw "目录不存在：/missing";
      custom = dir;
    }
    return undefined;
  });
}

describe("settingsStore", () => {
  beforeEach(() => {
    mocked.mockReset();
    store.setState({ open: false, defaultDir: null, customDir: null, error: null });
    native();
  });

  it("loads both folders when opened", async () => {
    store.getState().toggle();
    await vi.waitFor(() => expect(store.getState().defaultDir).toBe(MAGICAVOXEL));
    expect(store.getState()).toMatchObject({ open: true, customDir: null });
  });

  it("saves and clears an override", async () => {
    expect(await store.getState().save("/Users/me/Voxels")).toBe(true);
    expect(store.getState().customDir).toBe("/Users/me/Voxels");
    expect(await store.getState().save(null)).toBe(true);
    expect(store.getState().customDir).toBeNull();
  });

  it("keeps the native error and the old value", async () => {
    expect(await store.getState().save("/missing")).toBe(false);
    expect(store.getState()).toMatchObject({ customDir: null, error: "目录不存在：/missing" });
  });
});
