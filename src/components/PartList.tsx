import { useMemo, useState } from "react";
import { useModelStore } from "../store/modelStore";
import { partMarks } from "./labels";

const DEFAULT_GROUP = "body";

/** Parts in build order, split into sections by export group when there is more than one. */
export function PartList() {
  const spec = useModelStore((state) => state.spec);
  const grid = useModelStore((state) => state.grid);
  const selectedPart = useModelStore((state) => state.selectedPart);
  const togglePart = useModelStore((state) => state.togglePart);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  // Voxels each part owns in the finished model.
  const counts = useMemo(() => {
    const result = spec?.parts.map(() => 0) ?? [];
    for (const voxel of grid?.cells ?? []) {
      if (voxel) result[voxel.part] = (result[voxel.part] ?? 0) + 1;
    }
    return result;
  }, [spec, grid]);

  // Groups in order of first appearance, each with its parts' indices.
  const groups = useMemo(() => {
    const result = new Map<string, number[]>();
    spec?.parts.forEach((part, index) => {
      const group = part.group ?? DEFAULT_GROUP;
      result.set(group, [...(result.get(group) ?? []), index]);
    });
    return [...result];
  }, [spec]);

  const toggleGroup = (group: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });

  const rows = (indices: number[]) =>
    indices.map((index) => {
      const part = spec?.parts[index];
      if (!spec || !part) return null;
      const marks = partMarks(part);
      return (
        <li key={part.name}>
          <button
            type="button"
            className="part-row"
            aria-pressed={selectedPart === index}
            onClick={() => togglePart(index)}
          >
            <span className="part-row__swatch" style={{ background: spec.palette[part.color] }} />
            <span className="part-row__name">{part.name}</span>
            {marks.length > 0 && (
              <span className="part-row__marks">
                {marks.map(({ mark, label }) => (
                  <abbr key={mark} className="part-row__mark" title={label}>
                    {mark}
                  </abbr>
                ))}
              </span>
            )}
            <span className="part-row__count">{counts[index]}</span>
          </button>
        </li>
      );
    });

  return (
    <div className="part-list">
      <h2 className="panel__heading part-list__heading">
        <span>部件</span>
        {spec && <span className="part-list__total">{spec.parts.length} 个</span>}
      </h2>
      <div className="part-list__items">
        {groups.length <= 1 ? (
          <ol className="part-list__group" aria-label="部件">
            {rows(groups[0]?.[1] ?? [])}
          </ol>
        ) : (
          groups.map(([group, indices]) => {
            const open = !collapsed.has(group);
            const id = `part-group-${group}`;
            return (
              <section key={group} className="part-group">
                <button
                  type="button"
                  className="part-group__head"
                  aria-expanded={open}
                  aria-controls={id}
                  onClick={() => toggleGroup(group)}
                >
                  <svg className="part-group__chevron" viewBox="0 0 8 8" aria-hidden="true">
                    <path d="M1 2.5l3 3 3-3" />
                  </svg>
                  <span className="part-group__name">{group === DEFAULT_GROUP ? "主体" : group}</span>
                  {group !== DEFAULT_GROUP && <span className="part-group__hint">单独导出</span>}
                  <span className="part-group__count">{indices.length} 个</span>
                </button>
                <ol id={id} className="part-list__group" aria-label={group} hidden={!open}>
                  {rows(indices)}
                </ol>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
