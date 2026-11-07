import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { buildTiming, drawViewport, extractFaces, layerCount, makeBuildFrames } from "../render/viewport";
import type { ViewportStyle } from "../render/viewport";
import { BUILD_MS, useModelStore } from "../store/modelStore";
import { useProjectStore } from "../store/projectStore";
import { PRESET_LABELS } from "./labels";

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

/** The floor drawn when there is no model, so the empty canvas still looks like a viewport. */
const EMPTY_SIZE: [number, number, number] = [24, 24, 24];

const degrees = (radians: number) => Math.round((((radians * 180) / Math.PI) % 360 + 360) % 360);

const PLAY = (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d="M3 2l7 4-7 4z" />
  </svg>
);
const PAUSE = (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d="M3 2h2v8H3zM7 2h2v8H7z" />
  </svg>
);

/**
 * The toolbar while the model builds itself, layer by layer from the ground: pause, a
 * slider to any moment, the layer count, and 完成. A finished run hands the toolbar back.
 */
function BuildControls({ progress, layers }: { progress: number; layers: number }) {
  const { setBuildProgress, stopBuild } = useModelStore.getState();
  const [playing, setPlaying] = useState(true);

  // Plays from wherever the slider was left; the clock restarts when play resumes.
  useEffect(() => {
    if (!playing) return;
    // Playing again from the very end starts over.
    const left = useModelStore.getState().buildProgress ?? 0;
    const from = left >= 1 ? 0 : left;
    const start = performance.now() - from * BUILD_MS;
    let frame = 0;
    const tick = (now: number) => {
      const t = (now - start) / BUILD_MS;
      if (t >= 1) {
        stopBuild();
        return;
      }
      setBuildProgress(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, setBuildProgress, stopBuild]);

  const { landed, falling } = buildTiming(layers, progress);
  return (
    <>
      <button
        type="button"
        className="tool-button tool-button--square tool-button--on"
        aria-label={playing ? "暂停" : "继续"}
        onClick={() => setPlaying(!playing)}
      >
        {playing ? PAUSE : PLAY}
      </button>
      <input
        className="preview__scrub"
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        aria-label="搭建进度"
        onChange={(event) => {
          setPlaying(false);
          setBuildProgress(Number(event.target.value) / 1000);
        }}
      />
      <span className="preview__step">
        第 {Math.min(layers, landed + falling.length)} 层 / {layers}
      </span>
      <button type="button" className="tool-button" onClick={stopBuild}>
        完成
      </button>
    </>
  );
}

export function Viewport() {
  const spec = useModelStore((state) => state.spec);
  const grid = useModelStore((state) => state.grid);
  const issues = useModelStore((state) => state.issues);
  const hasProjects = useProjectStore((state) => state.projects.length > 0);
  const camera = useModelStore((state) => state.camera);
  const selectedPart = useModelStore((state) => state.selectedPart);
  const buildProgress = useModelStore((state) => state.buildProgress);
  const { orbit, pan, setView, resetCamera, clearSelection, startBuild } = useModelStore.getState();

  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; pan: boolean } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const building = buildProgress !== null;
  const modelFaces = useMemo(() => (grid ? extractFaces(grid) : []), [grid]);
  // Per-layer faces are cached inside, so each frame of the build only shifts falling slabs.
  const frames = useMemo(() => (grid && building ? makeBuildFrames(grid) : null), [grid, building]);
  const layers = useMemo(() => (grid ? layerCount(grid) : 0), [grid]);
  const faces = useMemo(
    () => (frames && buildProgress !== null ? frames(buildProgress) : modelFaces),
    [frames, buildProgress, modelFaces],
  );

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
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || size.width === 0 || size.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawViewport(ctx, grid?.size ?? EMPTY_SIZE, faces, spec?.palette ?? {}, {
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
  const selectedName = selectedPart === null ? undefined : spec?.parts[selectedPart]?.name;
  if (selectedName) viewLabel += ` · 只看「${selectedName}」`;

  return (
    <div className="preview">
      <div className="preview__area" ref={areaRef}>
        {/* Drawn even without a model: the floor and axes stay, with a note on top. */}
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
        {!grid && (
          <p className="preview__empty">
            {issues.length > 0
              ? "没有可显示的模型，问题见右侧校验。"
              : hasProjects
                ? "点左边的作品打开，或者在左下角描述一个新模型。"
                : "还没有模型，在左下角描述一个新模型。"}
          </p>
        )}
      </div>
      <div className="preview__label">{viewLabel}</div>
      <div className="preview__toolbar">
        {buildProgress !== null ? (
          <BuildControls progress={buildProgress} layers={layers} />
        ) : (
          <>
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
            <button type="button" className="tool-button tool-button--icon" onClick={startBuild} disabled={!spec}>
              {PLAY}
              搭建
            </button>
            <button type="button" className="tool-button" onClick={clearSelection} disabled={selectedPart === null}>
              显示全部
            </button>
          </>
        )}
      </div>
    </div>
  );
}
