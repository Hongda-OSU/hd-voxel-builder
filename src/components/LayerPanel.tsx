import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { voxelAt } from "../core/buildModel";
import { useModelStore } from "../store/modelStore";

const SLICE_WIDTH = 152; // CSS pixels available for the slice
const GHOST_ALPHA = 0.22;

interface Hover {
  where: string;
  what: string;
}

/** Cuts the model at height h and shows that layer from above, front at the bottom. */
export function LayerPanel() {
  const spec = useModelStore((state) => state.spec);
  const grid = useModelStore((state) => state.grid);
  const layer = useModelStore((state) => state.layer);
  const { toggleLayer, setLayer } = useModelStore.getState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const [w, depth, height] = grid?.size ?? [1, 1, 1];
  const cell = Math.max(2, Math.floor(SLICE_WIDTH / Math.max(w, depth)));

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
        const voxel = voxelAt(grid, x, layer.h, d);
        // The layer below shows faintly to help line things up.
        const shown = voxel ?? voxelAt(grid, x, layer.h - 1, d);
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
  }, [spec, grid, layer.on, layer.h, w, depth, cell]);

  if (!spec || !grid) return null;

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / cell);
    const d = Math.floor((event.clientY - rect.top) / cell);
    if (x < 0 || x >= w || d < 0 || d >= depth) return;
    const voxel = voxelAt(grid, x, layer.h, d);
    const part = voxel ? spec.parts[voxel.part] : undefined;
    setHover({
      where: `x ${x} · d ${d} · h ${layer.h}`,
      what: voxel && part ? `${part.name} ${spec.palette[voxel.color]}` : "空",
    });
  };

  return (
    <div className="layer-panel">
      <button type="button" className="layer-panel__toggle" aria-pressed={layer.on} onClick={toggleLayer}>
        {layer.on ? "按层查看 · 开" : "按层查看"}
      </button>
      {layer.on && (
        <>
          <label className="layer-panel__slider">
            h
            <input
              type="range"
              min={0}
              max={height - 1}
              value={layer.h}
              onChange={(event) => setLayer(Number(event.target.value))}
            />
            <span>{layer.h}</span>
          </label>
          <canvas
            ref={canvasRef}
            className="layer-panel__slice"
            aria-label="这一层的俯视切片，正面朝下"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
          />
          <div className="layer-panel__hover">
            {hover ? (
              <>
                <span>{hover.where}</span>
                <span>{hover.what}</span>
              </>
            ) : (
              <span>移到格子上看坐标和部件</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
