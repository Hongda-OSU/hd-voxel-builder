import type { Style } from "./types";

/** At most this many reference images go with one request, as in the native check. */
export const MAX_REFS = 3;
/** Longest edge sent to Claude; larger images are scaled down, smaller ones kept. */
export const MAX_EDGE = 1568;

export type RefMediaType = "image/png" | "image/jpeg";

/** A reference image ready to send: shrunk, without metadata, base64 encoded. */
export interface RefImage {
  mediaType: RefMediaType;
  data: string;
}

/** A reference image saved in a project's refs/ folder. */
export interface SavedRef extends RefImage {
  name: string;
}

/** The size that fits within `max` on the longer edge, never larger than the original. */
export function fitSize(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** PNG keeps transparency and hard pixel edges; photos go as JPEG. */
export function refMediaType(sourceType: string): RefMediaType {
  return /^image\/(jpeg|jpg|heic|heif)$/i.test(sourceType) ? "image/jpeg" : "image/png";
}

/** 1.png, 2.jpg…: the names refs/ uses, in the order project.json lists them. */
export function refFileName(index: number, mediaType: RefMediaType): string {
  return `${index + 1}.${mediaType === "image/png" ? "png" : "jpg"}`;
}

export function mediaTypeOf(name: string): RefMediaType {
  return name.endsWith(".png") ? "image/png" : "image/jpeg";
}

export function bytesToBase64(bytes: ArrayLike<number>): string {
  let binary = "";
  // Chunks keep String.fromCharCode under the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...Array.from({ length: Math.min(0x8000, bytes.length - i) }, (_, j) => bytes[i + j] as number));
  }
  return btoa(binary);
}

export function base64ToBytes(data: string): Uint8Array {
  return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
}

export function dataUrl(image: RefImage): string {
  return `data:${image.mediaType};base64,${image.data}`;
}

/** Puts a description draft after what is already typed, never over it. */
export function appendDraft(typed: string, draft: string): string {
  const before = typed.trimEnd();
  return before ? `${before}\n\n${draft.trim()}` : draft.trim();
}

const DRAFT_STYLES: [RegExp, Style][] = [
  [/^Q\s*版/, "chibi"],
  [/^物体/, "object"],
  [/^场景/, "diorama"],
];

/** The style a draft's 风格 line names, or null when it names none or several. */
export function draftStyle(draft: string): Style | null {
  const line = draft.split("\n").find((text) => /^\s*风格\s*[:：]/.test(text));
  const value = line?.replace(/^\s*风格\s*[:：]\s*/, "").trim() ?? "";
  if (value.includes("|")) return null;
  return DRAFT_STYLES.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}
