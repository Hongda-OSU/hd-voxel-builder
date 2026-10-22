import { useModelStore } from "../store/modelStore";
import type { InspectorTab } from "../store/modelStore";
import { IssueList } from "./IssueList";
import { LayerPanel } from "./LayerPanel";
import { PartList } from "./PartList";

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "parts", label: "部件" },
  { id: "layers", label: "分层" },
];

export function Inspector() {
  const tab = useModelStore((state) => state.inspectorTab);
  const setInspectorTab = useModelStore((state) => state.setInspectorTab);

  return (
    <aside className="panel panel--right" aria-label="检查器">
      <div className="segmented" role="tablist" aria-label="检查器">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="segmented__item"
            aria-selected={tab === id}
            onClick={() => setInspectorTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "parts" ? (
        <>
          <PartList />
          <IssueList />
        </>
      ) : (
        <LayerPanel />
      )}
    </aside>
  );
}
