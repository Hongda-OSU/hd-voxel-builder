import { fitSize, refMediaType } from "../core/refs";
import type { RefImage } from "../core/refs";

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读不了这个文件"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("打不开这张图"));
    image.src = src;
  });
}

/**
 * Redraws an image upright (WebKit applies the photo's rotation flag when it
 * decodes) at no more than MAX_EDGE, and exports it fresh, which drops every
 * piece of metadata, such as where a photo was taken.
 */
export async function prepareImage(file: Blob): Promise<RefImage> {
  const image = await loadImage(await readAsDataUrl(file));
  const { width, height } = fitSize(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画不出这张图");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  const mediaType = refMediaType(file.type);
  const url = canvas.toDataURL(mediaType, 0.9);
  return { mediaType, data: url.slice(url.indexOf(",") + 1) };
}
