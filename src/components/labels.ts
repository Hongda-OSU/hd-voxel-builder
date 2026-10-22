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

export function partTags(part: Part): string {
  const tags: string[] = [];
  if (part.sphere) tags.push("球体");
  if (part.chamfer === "all") tags.push("去棱");
  if (part.chamfer === "v") tags.push("去竖棱");
  if (part.mirrorX) tags.push("镜像");
  if (part.paint) tags.push("只涂色");
  if (part.group) tags.push(`分组 ${part.group}`);
  return tags.join(" · ");
}
