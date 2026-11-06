import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ExamplePanel } from "./components/ExamplePanel";
import { Inspector } from "./components/Inspector";
import { SettingsPanel } from "./components/SettingsPanel";
import { Viewport } from "./components/Viewport";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { examples } from "./prompts/examples";
import { useModelStore } from "./store/modelStore";
import { useSettingsStore } from "./store/settingsStore";

export default function App() {
  const loadSpec = useModelStore((state) => state.loadSpec);
  const settingsOpen = useSettingsStore((state) => state.open);

  useEffect(() => {
    const first = examples[0];
    if (first) loadSpec(first.data, first.id);
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
