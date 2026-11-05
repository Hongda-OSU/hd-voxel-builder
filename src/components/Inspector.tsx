import { IssueList } from "./IssueList";
import { MagicaVoxelPanel } from "./MagicaVoxelPanel";
import { PartList } from "./PartList";

export function Inspector() {
  return (
    <aside className="panel panel--right" aria-label="检查器">
      <h2 className="panel__heading">部件</h2>
      <PartList />
      <IssueList />
      <MagicaVoxelPanel />
    </aside>
  );
}
