import type { Part, Style } from "../core/types";
import type { PresetId } from "../render/viewport";

export const STYLE_LABELS: Record<Style, string> = {
  chibi: "Q 版人物",
  object: "物体",
  diorama: "场景小件",
};

export const PRESET_LABELS: { id: PresetId; label: string; aria: string }[] = [
  { id: "front", label: "前", aria: "正面视图" },
  { id: "right", label: "右", aria: "右侧视图" },
  { id: "back", label: "后", aria: "背面视图" },
  { id: "left", label: "左", aria: "左侧视图" },
  { id: "top", label: "顶", aria: "顶视图" },
];

/** One-character marks for a part's build options; the group shows as a section instead. */
export function partMarks(part: Part): { mark: string; label: string }[] {
  const marks: { mark: string; label: string }[] = [];
  if (part.sphere) marks.push({ mark: "球", label: "球体" });
  if (part.chamfer === "all") marks.push({ mark: "棱", label: "去掉 12 条棱" });
  if (part.chamfer === "v") marks.push({ mark: "竖", label: "去掉 4 条竖棱" });
  if (part.mirrorX) marks.push({ mark: "镜", label: "左右镜像" });
  if (part.paint) marks.push({ mark: "涂", label: "只涂色，不加方块" });
  return marks;
}

/** 今天 14:32, 昨天 14:32, or 11-03 for older times. */
export function shortTime(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const two = (n: number) => String(n).padStart(2, "0");
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  const clock = `${two(date.getHours())}:${two(date.getMinutes())}`;
  if (days === 0) return `今天 ${clock}`;
  if (days === 1) return `昨天 ${clock}`;
  return `${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}
