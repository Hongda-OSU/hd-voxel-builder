import { useEffect } from "react";
import { ExamplePanel } from "./components/ExamplePanel";
import { Inspector } from "./components/Inspector";
import { Viewport } from "./components/Viewport";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { examples } from "./prompts/examples";
import { useModelStore } from "./store/modelStore";

export default function App() {
  const loadSpec = useModelStore((state) => state.loadSpec);

  useEffect(() => {
    const first = examples[0];
    if (first) loadSpec(first.data);
  }, [loadSpec]);

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
    </div>
  );
}
