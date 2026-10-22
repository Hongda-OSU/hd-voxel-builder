import type { VoxelGrid } from "../core/types";

/** Quarter turns around the vertical axis; 0 looks at the front from the right. */
export type Rotation = 0 | 1 | 2 | 3;

/** A voxel in view space: x and z span the floor, y is up. */
export interface ViewVoxel {
  x: number;
  y: number;
  z: number;
  color: string;
  part: number;
}

export interface View {
  voxels: ViewVoxel[];
  /** Floor extents after rotation. */
  w: number;
  depth: number;
  height: number;
}

/** Turns a floor position (x, d) by quarter turns; the front (max d) starts facing view +z. */
export function rotateFloor(x: number, z: number, w: number, depth: number, rotation: Rotation): [number, number] {
  for (let i = 0; i < rotation; i++) {
    [x, z] = [depth - 1 - z, x];
    [w, depth] = [depth, w];
  }
  return [x, z];
}

/** Voxels in view space sorted back to front; `revealUpTo` hides later parts. */
export function viewVoxels(grid: VoxelGrid, rotation: Rotation, revealUpTo: number | null = null): View {
  const [w, depth, height] = grid.size;
  const voxels: ViewVoxel[] = [];
  grid.cells.forEach((voxel, i) => {
    if (!voxel || (revealUpTo !== null && voxel.part > revealUpTo)) return;
    const x = i % w;
    const d = Math.floor(i / w) % depth;
    const h = Math.floor(i / (w * depth));
    const [vx, vz] = rotateFloor(x, d, w, depth, rotation);
    voxels.push({ x: vx, y: h, z: vz, color: voxel.color, part: voxel.part });
  });
  voxels.sort((a, b) => a.x + a.y + a.z - (b.x + b.y + b.z) || a.y - b.y);
  const turned = rotation % 2 === 1;
  return { voxels, w: turned ? depth : w, depth: turned ? w : depth, height };
}

export interface Fit {
  scale: number;
  ox: number;
  oy: number;
}

/** Scale and origin that fit the whole canvas box, centred, into width x height pixels. */
export function fitView(view: Pick<View, "w" | "depth" | "height">, width: number, height: number): Fit {
  const { w, depth } = view;
  const scale = Math.min(width / ((w + depth) * 0.866 + 4), height / ((w + depth) * 0.5 + view.height + 4));
  const ox = width / 2 + ((depth - w) * 0.866 * scale) / 2;
  const oy = height - 2 * scale - (w + depth) * 0.5 * scale;
  return { scale, ox, oy };
}

export function project(fit: Fit, x: number, y: number, z: number): [number, number] {
  return [fit.ox + (x - z) * 0.866 * fit.scale, fit.oy + (x + z) * 0.5 * fit.scale - y * fit.scale];
}

export interface IsoOptions {
  rotation: Rotation;
  /** Part drawn opaque while the rest fade; null shows everything. */
  highlight: number | null;
  revealUpTo: number | null;
  width: number;
  height: number;
  floor: string;
}

/** Draws the grid with the painter's algorithm and per-face ambient occlusion. */
export function drawIso(
  ctx: CanvasRenderingContext2D,
  grid: VoxelGrid,
  palette: Record<string, string>,
  options: IsoOptions,
): void {
  const view = viewVoxels(grid, options.rotation, options.revealUpTo);
  const fit = fitView(view, options.width, options.height);
  const P = (x: number, y: number, z: number) => project(fit, x, y, z);
  // Neighbours may sit one cell outside the canvas, so offset keys by one.
  const key = (x: number, y: number, z: number) => x + 1 + 66 * (y + 1 + 66 * (z + 1));
  const filled = new Set(view.voxels.map((v) => key(v.x, v.y, v.z)));
  const has = (x: number, y: number, z: number) => filled.has(key(x, y, z));

  ctx.clearRect(0, 0, options.width, options.height);
  ctx.globalAlpha = 1;
  ctx.fillStyle = options.floor;
  polygon(ctx, [P(0, 0, 0), P(view.w, 0, 0), P(view.w, 0, view.depth), P(0, 0, view.depth)]);
  ctx.fill();

  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  const face = (points: [number, number][], fill: string) => {
    polygon(ctx, points);
    ctx.fillStyle = fill;
    ctx.fill();
    // A same-colour stroke hides the hairline seams between faces.
    ctx.strokeStyle = fill;
    ctx.stroke();
  };
  type Vec = [number, number, number];
  const occlusion = (x: number, y: number, z: number, n: Vec, t1: Vec, t2: Vec) => {
    let count = 0;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        if ((a !== 0 || b !== 0) && has(x + n[0] + a * t1[0] + b * t2[0], y + n[1] + a * t1[1] + b * t2[1], z + n[2] + a * t1[2] + b * t2[2])) count++;
      }
    }
    return 1 - Math.min(count, 6) * 0.055;
  };

  for (const { x, y, z, color, part } of view.voxels) {
    const hex = palette[color] ?? "#ff00ff";
    ctx.globalAlpha = options.highlight === null || options.highlight === part ? 1 : 0.12;
    const lift = 0.92 + (0.1 * y) / view.height;
    if (!has(x, y + 1, z)) {
      face([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)],
        shade(hex, 1.06 * lift * occlusion(x, y, z, [0, 1, 0], [1, 0, 0], [0, 0, 1])));
    }
    if (!has(x, y, z + 1)) {
      face([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)],
        shade(hex, 0.86 * lift * occlusion(x, y, z, [0, 0, 1], [1, 0, 0], [0, 1, 0])));
    }
    if (!has(x + 1, y, z)) {
      face([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)],
        shade(hex, 0.7 * lift * occlusion(x, y, z, [1, 0, 0], [0, 1, 0], [0, 0, 1])));
    }
  }
  ctx.globalAlpha = 1;
}

function polygon(ctx: CanvasRenderingContext2D, points: [number, number][]): void {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
}

export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.min(255, Math.round(((n >> shift) & 255) * factor));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}
