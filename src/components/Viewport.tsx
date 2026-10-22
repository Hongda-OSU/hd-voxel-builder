import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { drawViewport, extractFaces } from "../render/viewport";
import type { ViewportStyle } from "../render/viewport";
import { useModelStore } from "../store/modelStore";
import { PRESET_LABELS } from "./labels";
import { LayerPanel } from "./LayerPanel";

const ORBIT_SPEED = 0.01; // radians per CSS pixel
const ZOOM_SPEED = 0.0015;

function readStyle(): ViewportStyle {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    gridFine: token("--grid-fine"),
    gridMajor: token("--grid-major"),
    gridEdge: token("--grid-edge"),
    gizmoBackdrop: token("--gizmo-backdrop"),
    gizmoText: token("--ground"),
  };
}

const degrees = (radians: number) => Math.round((((radians * 180) / Math.PI) % 360 + 360) % 360);

export function Viewport() {
  const spec = useModelStore((state) => state.spec);
  const grid = useModelStore((state) => state.grid);
  const camera = useModelStore((state) => state.camera);
  const selectedPart = useModelStore((state) => state.selectedPart);
  const layer = useModelStore((state) => state.layer);
  const { orbit, pan, setView, resetCamera, clearSelection } = useModelStore.getState();

  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; pan: boolean } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const maxH = layer.on ? layer.h : null;
  const faces = useMemo(() => (grid ? extractFaces(grid, { revealUpTo: null, maxH }) : []), [grid, maxH]);

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

  // React registers wheel listeners as passive, so preventDefault needs a native one.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      useModelStore.getState().zoomBy(Math.exp(-event.deltaY * ZOOM_SPEED));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [grid]);

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
    drawViewport(ctx, grid.size, faces, spec.palette, {
      camera,
      highlight: selectedPart,
      width: size.width,
      height: size.height,
      style: readStyle(),
    });
  }, [spec, grid, faces, camera, selectedPart, size]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: event.clientX, y: event.clientY, pan: event.shiftKey || event.button === 2 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    current.x = event.clientX;
    current.y = event.clientY;
    if (current.pan) pan(dx, dy);
    else orbit(-dx * ORBIT_SPEED, dy * ORBIT_SPEED);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  let viewLabel = `方位 ${degrees(camera.yaw)}° · 俯角 ${degrees(camera.pitch)}° · ${Math.round(camera.zoom * 100)}%`;
  if (selectedPart !== null) viewLabel += ` · 只看第 ${selectedPart + 1} 步`;
  if (maxH !== null) viewLabel += ` · 剖到 h = ${maxH}`;

  return (
    <div className="preview">
      <div className="preview__area" ref={areaRef}>
        {grid ? (
          <canvas
            ref={canvasRef}
            className="preview__canvas"
            aria-label="3D 视口：拖动旋转，滚轮缩放，按住 Shift 拖动平移，双击重置"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={resetCamera}
            onContextMenu={(event) => event.preventDefault()}
          />
        ) : (
          <p className="preview__empty">没有可显示的模型，问题见右侧校验。</p>
        )}
      </div>
      <div className="preview__label">{viewLabel}</div>
      <LayerPanel />
      <div className="preview__toolbar">
        {PRESET_LABELS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="tool-button tool-button--square"
            aria-label={preset.aria}
            onClick={() => setView(preset.id)}
          >
            {preset.label}
          </button>
        ))}
        <span className="preview__divider" aria-hidden="true" />
        <button type="button" className="tool-button" onClick={clearSelection} disabled={selectedPart === null}>
          显示全部
        </button>
      </div>
    </div>
  );
}
