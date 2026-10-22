import { useEffect, useRef, useState } from "react";
import { drawIso } from "../render/iso";
import { useModelStore } from "../store/modelStore";
import { ROTATION_LABELS } from "./labels";

export function IsoPreview() {
  const spec = useModelStore((state) => state.spec);
  const grid = useModelStore((state) => state.grid);
  const rotation = useModelStore((state) => state.rotation);
  const selectedPart = useModelStore((state) => state.selectedPart);
  const rotate = useModelStore((state) => state.rotate);
  const clearSelection = useModelStore((state) => state.clearSelection);

  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !spec || !grid || size.width === 0 || size.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const floor = getComputedStyle(document.documentElement).getPropertyValue("--floor").trim();
    drawIso(ctx, grid, spec.palette, {
      rotation,
      highlight: selectedPart,
      revealUpTo: null,
      width: size.width,
      height: size.height,
      floor,
    });
  }, [spec, grid, rotation, selectedPart, size]);

  let viewLabel = `视角：${ROTATION_LABELS[rotation]}`;
  if (selectedPart !== null) viewLabel += ` · 只看第 ${selectedPart + 1} 步`;

  return (
    <div className="preview">
      <div className="preview__area" ref={areaRef}>
        {grid ? (
          <canvas ref={canvasRef} aria-label="等距预览" />
        ) : (
          <p className="preview__empty">没有可显示的模型，问题见右侧校验。</p>
        )}
      </div>
      <div className="preview__label">{viewLabel}</div>
      <div className="preview__toolbar">
        <button type="button" className="tool-button" onClick={() => rotate(-1)} aria-label="向左转 90 度">
          ↺ 90°
        </button>
        <button type="button" className="tool-button" onClick={() => rotate(1)} aria-label="向右转 90 度">
          ↻ 90°
        </button>
        <span className="preview__divider" aria-hidden="true" />
        <button type="button" className="tool-button" onClick={clearSelection} disabled={selectedPart === null}>
          显示全部
        </button>
      </div>
    </div>
  );
}
