import { useEffect } from "react";
import { ExamplePanel } from "./components/ExamplePanel";
import { Viewport } from "./components/Viewport";
import { IssueList } from "./components/IssueList";
import { PartList } from "./components/PartList";
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
        <aside className="panel panel--right" aria-label="部件与校验">
          <PartList />
          <IssueList />
        </aside>
      </main>
    </div>
  );
}
