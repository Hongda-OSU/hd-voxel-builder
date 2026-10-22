import { cellIndex, inBounds } from "../core/buildModel";
import type { VoxelGrid } from "../core/types";

/** A point or direction in grid space: [x, h, d]. */
export type Vec3 = [number, number, number];

export interface Face {
  normal: Vec3;
  corners: [Vec3, Vec3, Vec3, Vec3];
  center: Vec3;
  /** Palette key. */
  color: string;
  part: number;
  /** Lighting times ambient occlusion, applied to the palette color. */
  brightness: number;
}

export interface FaceFilter {
  /** Hide parts after this index (build animation). */
  revealUpTo: number | null;
  /** Hide voxels above this height (layer view). */
  maxH: number | null;
}

type Axis = 0 | 1 | 2;

const DIRECTIONS: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// Fixed in grid space, so shading turns with the model: above, front-right.
const LIGHT: Vec3 = (() => {
  const l: Vec3 = [0.35, 0.85, 0.4];
  const n = Math.hypot(...l);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

/** Faces with no visible neighbour; recompute only when the model or filter changes. */
export function extractFaces(grid: VoxelGrid, filter: FaceFilter = { revealUpTo: null, maxH: null }): Face[] {
  const [w, depth] = grid.size;
  const shown = (x: number, h: number, d: number) => {
    if (!inBounds(grid.size, x, h, d)) return false;
    if (filter.maxH !== null && h > filter.maxH) return false;
    const voxel = grid.cells[cellIndex(grid.size, x, h, d)];
    return voxel !== undefined && (filter.revealUpTo === null || voxel.part <= filter.revealUpTo);
  };

  const faces: Face[] = [];
  grid.cells.forEach((voxel, i) => {
    if (!voxel) return;
    const p: Vec3 = [i % w, Math.floor(i / (w * depth)), Math.floor(i / w) % depth];
    if (!shown(...p)) return;
    for (const n of DIRECTIONS) {
      if (shown(p[0] + n[0], p[1] + n[1], p[2] + n[2])) continue;
      const axis: Axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
      const a = ((axis + 1) % 3) as Axis;
      const b = ((axis + 2) % 3) as Axis;

      // Ambient occlusion: filled cells around the face, one step out along its normal.
      let around = 0;
      for (let i2 = -1; i2 <= 1; i2++) {
        for (let j = -1; j <= 1; j++) {
          if (i2 === 0 && j === 0) continue;
          const q: Vec3 = [p[0] + n[0], p[1] + n[1], p[2] + n[2]];
          q[a] += i2;
          q[b] += j;
          if (shown(...q)) around++;
        }
      }
      const light = 0.62 + 0.45 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);

      const base: Vec3 = [p[0], p[1], p[2]];
      if (n[axis] > 0) base[axis] += 1;
      const corner = (da: number, db: number): Vec3 => {
        const c: Vec3 = [base[0], base[1], base[2]];
        c[a] += da;
        c[b] += db;
        return c;
      };
      faces.push({
        normal: n,
        corners: [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)],
        center: [p[0] + 0.5 + n[0] / 2, p[1] + 0.5 + n[1] / 2, p[2] + 0.5 + n[2] / 2],
        color: voxel.color,
        part: voxel.part,
        brightness: light * (1 - Math.min(around, 6) * 0.055),
      });
    }
  });
  return faces;
}

/** Orthographic orbit camera around the canvas centre. Angles are radians. */
export interface Camera {
  /** Turn around the vertical axis; 0 looks at the front (max d). */
  yaw: number;
  /** Elevation above the floor plane, from 0 (level) to PITCH_MAX (top). */
  pitch: number;
  zoom: number;
  /** Screen-space offset in CSS pixels. */
  panX: number;
  panY: number;
}

export const PITCH_MAX = Math.PI / 2 - 0.001;
export const ZOOM_LIMITS = { min: 0.1, max: 12 };

const deg = (d: number) => (d * Math.PI) / 180;

export const DEFAULT_CAMERA: Camera = { yaw: deg(35), pitch: deg(28), zoom: 1, panX: 0, panY: 0 };

export type PresetId = "front" | "right" | "back" | "left" | "top";

export const VIEW_PRESETS: Record<PresetId, Pick<Camera, "yaw" | "pitch">> = {
  front: { yaw: 0, pitch: 0 },
  right: { yaw: deg(90), pitch: 0 },
  back: { yaw: deg(180), pitch: 0 },
  left: { yaw: deg(-90), pitch: 0 },
  top: { yaw: 0, pitch: PITCH_MAX },
};

export const clampPitch = (pitch: number) => Math.max(0, Math.min(PITCH_MAX, pitch));
export const clampZoom = (zoom: number) => Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, zoom));

export interface Projector {
  /** Screen x, screen y and depth toward the camera. */
  project: (p: Vec3) => [number, number, number];
  /** Positive when a face with this normal faces the camera. */
  facing: (n: Vec3) => number;
  /** The floor (h = 0) point [x, d] under a screen point; null when the floor is edge-on. */
  toFloor: (sx: number, sy: number) => [number, number] | null;
  /** Screen pixels per grid cell. */
  scale: number;
}

// Below this pitch the floor is too close to edge-on to solve for.
const EDGE_ON = 0.03;

/** Rotates a grid-space vector into camera space: [right, up, toward the camera]. */
export function toCamera(camera: Pick<Camera, "yaw" | "pitch">, [x, h, d]: Vec3): Vec3 {
  const x1 = x * Math.cos(camera.yaw) - d * Math.sin(camera.yaw);
  const z1 = x * Math.sin(camera.yaw) + d * Math.cos(camera.yaw);
  return [x1, h * Math.cos(camera.pitch) - z1 * Math.sin(camera.pitch), h * Math.sin(camera.pitch) + z1 * Math.cos(camera.pitch)];
}

export function makeProjector(size: VoxelGrid["size"], camera: Camera, width: number, height: number): Projector {
  const [w, depth, tall] = size;
  // Fits the canvas box's bounding sphere at zoom 1.
  const scale = ((Math.min(width, height) / Math.hypot(w, depth, tall)) * 0.95) * camera.zoom;
  const ox = width / 2 + camera.panX;
  const oy = height / 2 + camera.panY;
  return {
    project: ([x, h, d]) => {
      const [vx, vy, vz] = toCamera(camera, [x - w / 2, h - tall / 2, d - depth / 2]);
      return [ox + vx * scale, oy - vy * scale, vz];
    },
    facing: (n) => toCamera(camera, n)[2],
    toFloor: (sx, sy) => {
      const sp = Math.sin(camera.pitch);
      if (sp < EDGE_ON) return null;
      // Orthographic: invert the projection with the floor's height fixed.
      const right = (sx - ox) / scale;
      const up = -(sy - oy) / scale;
      const toward = (-(tall / 2) * Math.cos(camera.pitch) - up) / sp;
      const cosYaw = Math.cos(camera.yaw);
      const sinYaw = Math.sin(camera.yaw);
      return [right * cosYaw + toward * sinYaw + w / 2, -right * sinYaw + toward * cosYaw + depth / 2];
    },
    scale,
  };
}

const MIN_LINE_GAP = 6; // CSS pixels between fine grid lines
const MAX_MAJOR_LINES = 240;
const FINE_REACH = 80; // fine lines drawn this many steps from the centre
const MAX_REACH = 5000; // cells; far enough to look endless

/** Fine grid spacing in cells (1, 10, 100…) and the major spacing above it. */
export function gridSteps(pixelsPerCell: number, reach: number): { fine: number; major: number } {
  let fine = 1;
  if (pixelsPerCell > 0) while (fine * pixelsPerCell < MIN_LINE_GAP) fine *= 10;
  let major = fine * 10;
  while ((2 * reach) / major > MAX_MAJOR_LINES) major *= 10;
  return { fine, major };
}

/** Camera-facing faces sorted far to near for the painter's algorithm. */
export function visibleFaces(faces: Face[], projector: Projector): Face[] {
  return faces
    .filter((face) => projector.facing(face.normal) > 1e-6)
    .map((face) => ({ face, depth: projector.project(face.center)[2] }))
    .sort((a, b) => a.depth - b.depth)
    .map(({ face }) => face);
}

export interface ViewportStyle {
  gridFine: string;
  gridMajor: string;
  /** The canvas footprint and the horizon line. */
  gridEdge: string;
  gizmoBackdrop: string;
  gizmoText: string;
}

export interface ViewportOptions {
  camera: Camera;
  /** Part drawn opaque while the rest fade; null shows everything. */
  highlight: number | null;
  width: number;
  height: number;
  style: ViewportStyle;
}

// Matches the .vox export axes: X = x, Y = d, Z = h.
const AXES: { dir: Vec3; color: string; label: string }[] = [
  { dir: [1, 0, 0], color: "#ff6b6b", label: "x" },
  { dir: [0, 0, 1], color: "#7ddc6f", label: "d" },
  { dir: [0, 1, 0], color: "#5aa9ff", label: "h" },
];

/** Draws in CSS pixels; scale the context for the device pixel ratio first. */
export function drawViewport(
  ctx: CanvasRenderingContext2D,
  size: VoxelGrid["size"],
  faces: Face[],
  palette: Record<string, string>,
  options: ViewportOptions,
): void {
  const { width, height, style } = options;
  const projector = makeProjector(size, options.camera, width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  drawFloor(ctx, size, projector, width, height, style);

  ctx.lineJoin = "round";
  ctx.lineWidth = 1;
  for (const face of visibleFaces(faces, projector)) {
    ctx.globalAlpha = options.highlight === null || options.highlight === face.part ? 1 : 0.12;
    polygon(ctx, face.corners.map((c) => projector.project(c)));
    const fill = shade(palette[face.color] ?? "#ff00ff", face.brightness);
    ctx.fillStyle = fill;
    ctx.fill();
    // A same-colour stroke hides the hairline seams between faces.
    ctx.strokeStyle = fill;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  drawGizmo(ctx, options.camera, width - 42, 42, style);
}

/**
 * An endless floor like an editor viewport: grid lines over all the visible floor,
 * fading with distance, coarser when zoomed out, plus x / d axis lines and the
 * canvas footprint.
 */
function drawFloor(
  ctx: CanvasRenderingContext2D,
  size: VoxelGrid["size"],
  projector: Projector,
  width: number,
  height: number,
  style: ViewportStyle,
) {
  const [w, depth] = size;
  const cx = w / 2;
  const cz = depth / 2;
  const corners = [projector.toFloor(0, 0), projector.toFloor(width, 0), projector.toFloor(0, height), projector.toFloor(width, height)];
  ctx.lineWidth = 1;
  if (corners.some((c) => c === null)) {
    const [, y] = projector.project([cx, 0, cz]);
    ctx.strokeStyle = style.gridEdge;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    return;
  }
  const reach = Math.min(
    MAX_REACH,
    Math.max(...corners.map((c) => (c ? Math.hypot(c[0] - cx, c[1] - cz) : 0))),
  );
  const { fine, major } = gridSteps(projector.scale, reach);
  strokeGrid(ctx, projector, [cx, cz], fine, Math.min(reach, fine * FINE_REACH), style.gridFine);
  strokeGrid(ctx, projector, [cx, cz], major, reach, style.gridMajor);

  for (const axis of AXES.filter((a) => a.dir[1] === 0)) {
    const from = projector.project([cx - axis.dir[0] * reach, 0, cz - axis.dir[2] * reach]);
    const to = projector.project([cx + axis.dir[0] * reach, 0, cz + axis.dir[2] * reach]);
    const gradient = ctx.createLinearGradient(from[0], from[1], to[0], to[1]);
    gradient.addColorStop(0, `${axis.color}00`);
    gradient.addColorStop(0.5, `${axis.color}8c`);
    gradient.addColorStop(1, `${axis.color}00`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
  }

  ctx.strokeStyle = style.gridEdge;
  ctx.lineWidth = 1;
  polygon(ctx, [projector.project([0, 0, 0]), projector.project([w, 0, 0]), projector.project([w, 0, depth]), projector.project([0, 0, depth])]);
  ctx.stroke();
}

const FADE_BUCKETS = 6;

/** Grid lines every `step` cells within `radius` of the centre, fading outward. */
function strokeGrid(
  ctx: CanvasRenderingContext2D,
  projector: Projector,
  [cx, cz]: [number, number],
  step: number,
  radius: number,
  color: string,
) {
  // One path per fade level keeps the stroke count small.
  const paths = Array.from({ length: FADE_BUCKETS }, () => new Path2D());
  const chunk = Math.max(step / 2, radius / 24);
  const segment = (a: [number, number], b: [number, number]) => {
    const fade = 1 - Math.hypot((a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cz) / radius;
    if (fade <= 0) return;
    const path = paths[Math.min(FADE_BUCKETS - 1, Math.floor(fade * FADE_BUCKETS))];
    const p1 = projector.project([a[0], 0, a[1]]);
    const p2 = projector.project([b[0], 0, b[1]]);
    path?.moveTo(p1[0], p1[1]);
    path?.lineTo(p2[0], p2[1]);
  };
  for (let x = Math.ceil((cx - radius) / step) * step; x <= cx + radius; x += step) {
    for (let t = -radius; t < radius; t += chunk) segment([x, cz + t], [x, cz + t + chunk]);
  }
  for (let d = Math.ceil((cz - radius) / step) * step; d <= cz + radius; d += step) {
    for (let t = -radius; t < radius; t += chunk) segment([cx + t, d], [cx + t + chunk, d]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  paths.forEach((path, i) => {
    ctx.globalAlpha = (i + 1) / FADE_BUCKETS;
    ctx.stroke(path);
  });
  ctx.globalAlpha = 1;
}

function drawGizmo(ctx: CanvasRenderingContext2D, camera: Camera, cx: number, cy: number, style: ViewportStyle) {
  const length = 22;
  ctx.fillStyle = style.gizmoBackdrop;
  ctx.beginPath();
  ctx.arc(cx, cy, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "600 11px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const axes = AXES.map((axis) => {
    const [right, up, depth] = toCamera(camera, axis.dir);
    return { ...axis, tip: [right, -up], depth };
  }).sort((a, b) => a.depth - b.depth);
  for (const axis of axes) {
    const x = cx + (axis.tip[0] ?? 0) * length;
    const y = cy + (axis.tip[1] ?? 0) * length;
    ctx.globalAlpha = axis.depth < -0.05 ? 0.45 : 1;
    ctx.strokeStyle = axis.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = axis.color;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = style.gizmoText;
    ctx.fillText(axis.label, x, y + 0.5);
  }
  ctx.globalAlpha = 1;
}

function polygon(ctx: CanvasRenderingContext2D, points: [number, number, number][]): void {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
}

export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}
