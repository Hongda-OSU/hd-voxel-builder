import { useMemo } from "react";
import { useModelStore } from "../store/modelStore";
import { partTags } from "./labels";

export function PartList() {
  const spec = useModelStore((state) => state.spec);
  const grid = useModelStore((state) => state.grid);
  const selectedPart = useModelStore((state) => state.selectedPart);
  const togglePart = useModelStore((state) => state.togglePart);

  // Voxels each part owns in the finished model.
  const counts = useMemo(() => {
    const result = spec?.parts.map(() => 0) ?? [];
    for (const voxel of grid?.cells ?? []) {
      if (voxel) result[voxel.part] = (result[voxel.part] ?? 0) + 1;
    }
    return result;
  }, [spec, grid]);

  return (
    <div className="part-list">
      <p className="part-list__hint">点一下只看这一步</p>
      <ol className="part-list__items" aria-label="部件">
        {spec?.parts.map((part, index) => (
          <li key={part.name}>
            <button
              type="button"
              className="part-row"
              aria-pressed={selectedPart === index}
              onClick={() => togglePart(index)}
            >
              <span className="part-row__index">{index + 1}</span>
              <span className="part-row__swatch" style={{ background: spec.palette[part.color] }} />
              <span className="part-row__text">
                <span className="part-row__name">{part.name}</span>
                <span className="part-row__tags">{partTags(part) || "长方体"}</span>
              </span>
              <span className="part-row__count">{counts[index]}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
