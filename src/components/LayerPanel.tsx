import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { voxelAt } from "../core/buildModel";
import { layerParts } from "../core/layers";
import { useModelStore } from "../store/modelStore";

const SLICE_WIDTH = 258; // CSS pixels: the inspector's inner width
const GHOST_ALPHA = 0.22;

interface Hover {
  where: string;
  what: string;
}

/** The inspector's layers tab: one layer from above, front at the bottom, and what it holds. */
export function LayerPanel() {
  const spec = useModelStore((state) => state.spec);
  const grid = useModelStore((state) => state.grid);
  const layerH = useModelStore((state) => state.layerH);
  const selectedPart = useModelStore((state) => state.selectedPart);
  const { setLayer, stepLayer, togglePart } = useModelStore.getState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const [w, depth, height] = grid?.size ?? [1, 1, 1];
  const cell = Math.max(2, Math.floor(SLICE_WIDTH / Math.max(w, depth)));
  const rows = useMemo(() => (grid ? layerParts(grid, layerH) : []), [grid, layerH]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !spec || !grid) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * cell * dpr;
    canvas.height = depth * cell * dpr;
    canvas.style.width = `${w * cell}px`;
    canvas.style.height = `${depth * cell}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    ctx.fillStyle = css.getPropertyValue("--slice-empty").trim();
    ctx.fillRect(0, 0, w * cell, depth * cell);
    const outline = css.getPropertyValue("--slice-outline").trim();
    for (let x = 0; x < w; x++) {
      for (let d = 0; d < depth; d++) {
        const voxel = voxelAt(grid, x, layerH, d);
        // The layer below shows faintly to help line things up.
        const shown = voxel ?? voxelAt(grid, x, layerH - 1, d);
        if (!shown) continue;
        ctx.globalAlpha = voxel ? 1 : GHOST_ALPHA;
        ctx.fillStyle = spec.palette[shown.color] ?? "#ff00ff";
        ctx.fillRect(x * cell, d * cell, cell, cell);
        if (cell >= 6) {
          ctx.strokeStyle = outline;
          ctx.lineWidth = 1;
          ctx.strokeRect(x * cell + 1.5, d * cell + 1.5, cell - 3, cell - 3);
        }
      }
    }
    ctx.globalAlpha = 1;
  }, [spec, grid, layerH, w, depth, cell]);

  if (!spec || !grid) return <p className="panel__note">没有可显示的模型。</p>;

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / cell);
    const d = Math.floor((event.clientY - rect.top) / cell);
    if (x < 0 || x >= w || d < 0 || d >= depth) return;
    const voxel = voxelAt(grid, x, layerH, d);
    const part = voxel ? spec.parts[voxel.part] : undefined;
    setHover({
      where: `x ${x} · d ${d} · h ${layerH}`,
      what: voxel && part ? `${part.name} ${spec.palette[voxel.color]}` : "空",
    });
  };

  return (
    <div className="layer-panel">
      <div className="layer-panel__controls">
        <button type="button" className="step-button" aria-label="下一层" onClick={() => stepLayer(-1)} disabled={layerH === 0}>
          −
        </button>
        <input
          type="range"
          min={0}
          max={height - 1}
          value={layerH}
          aria-label="高度 h"
          onChange={(event) => setLayer(Number(event.target.value))}
        />
        <button
          type="button"
          className="step-button"
          aria-label="上一层"
          onClick={() => stepLayer(1)}
          disabled={layerH === height - 1}
        >
          +
        </button>
        <span className="layer-panel__value">
          <strong>{layerH}</strong> / {height - 1}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="layer-panel__slice"
        aria-label="这一层的俯视切片，正面朝下"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      />
      <div className="layer-panel__legend">
        <span>正面朝下 · 浅色是下一层</span>
        <span>{rows.reduce((sum, row) => sum + row.voxels, 0)} 格</span>
      </div>
      <div className="layer-panel__hover">
        {hover ? (
          <>
            <span className="layer-panel__where">{hover.where}</span>
            <span>{hover.what}</span>
          </>
        ) : (
          <span className="layer-panel__where">移到格子上看坐标和部件</span>
        )}
      </div>
      <h2 className="layer-panel__heading" id="layer-parts-heading">
        这一层有
      </h2>
      <ul aria-labelledby="layer-parts-heading">
        {rows.map(({ part, voxels }) => {
          const p = spec.parts[part];
          if (!p) return null;
          return (
            <li key={p.name}>
              <button
                type="button"
                className="part-row"
                aria-pressed={selectedPart === part}
                onClick={() => togglePart(part)}
              >
                <span className="part-row__swatch" style={{ background: spec.palette[p.color] }} />
                <span className="part-row__text">
                  <span className="part-row__name">{p.name}</span>
                </span>
                <span className="part-row__count">{voxels}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
