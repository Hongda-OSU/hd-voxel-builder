import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ExamplePanel } from "./components/ExamplePanel";
import { Inspector } from "./components/Inspector";
import { SettingsPanel } from "./components/SettingsPanel";
import { Viewport } from "./components/Viewport";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { examples } from "./prompts/examples";
import { useModelStore } from "./store/modelStore";
import { useProjectStore } from "./store/projectStore";
import { useSettingsStore } from "./store/settingsStore";

export default function App() {
  const loadSpec = useModelStore((state) => state.loadSpec);
  const settingsOpen = useSettingsStore((state) => state.open);

  // Reopens the most recently changed project. The very first run adds the starter
  // projects; with none left the canvas stays empty. The browser build has no
  // projects, so it shows one example.
  useEffect(() => {
    if (!isTauri()) {
      const first = examples[0];
      if (first) loadSpec(first.data, first.id);
      return;
    }
    void (async () => {
      const store = useProjectStore.getState();
      await store.refresh();
      if (await invoke<boolean>("take_first_run").catch(() => false)) await store.addStarters();
      const newest = useProjectStore.getState().projects[0];
      if (newest) await store.open(newest.id);
    })();
  }, [loadSpec]);

  // The app menu's 设置… item (⌘,) lives on the native side.
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen("open-settings", () => useSettingsStore.getState().toggle());
    return () => void unlisten.then((stop) => stop());
  }, []);

  return (
    <div className="app">
      <TitleBar />
      <main className="workspace">
        <ExamplePanel />
        <section className="stage" aria-label="3D 视口">
          <Viewport />
          <StatusBar />
        </section>
        <Inspector />
      </main>
      {settingsOpen && <SettingsPanel />}
    </div>
  );
}
