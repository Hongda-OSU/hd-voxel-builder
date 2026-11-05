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
