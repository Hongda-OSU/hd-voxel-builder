import type { Part, Style } from "../core/types";
import type { Rotation } from "../render/iso";

export const STYLE_LABELS: Record<Style, string> = {
  chibi: "Q 版人物",
  object: "物体",
  diorama: "场景小件",
};

export const ROTATION_LABELS: Record<Rotation, string> = {
  0: "正面偏右",
  1: "右侧偏后",
  2: "背面偏左",
  3: "左侧偏前",
};

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
