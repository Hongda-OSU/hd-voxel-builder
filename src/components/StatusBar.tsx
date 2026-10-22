import { useMemo } from "react";
import { useModelStore } from "../store/modelStore";

export function StatusBar() {
  const spec = useModelStore((state) => state.spec);
  const grid = useModelStore((state) => state.grid);

  const stats = useMemo(() => {
    if (!grid) return null;
    const filled = grid.cells.filter((voxel) => voxel !== undefined);
    return { voxels: filled.length, colors: new Set(filled.map((voxel) => voxel.color)).size };
  }, [grid]);

  if (!spec || !stats) return <footer className="status-bar" />;
  const [w, d, h] = spec.size;
  return (
    <footer className="status-bar">
      <span>拖动旋转 · 滚轮缩放 · ⇧ 拖动平移 · 双击重置</span>
      <span>
        {w} × {d} × {h} · {stats.voxels.toLocaleString("en-US")} 体素 · {stats.colors} 色 · {spec.parts.length} 部件
      </span>
    </footer>
  );
}
