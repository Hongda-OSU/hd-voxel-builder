import { describe, expect, it } from "vitest";
import {
  appendDraft,
  base64ToBytes,
  bytesToBase64,
  draftStyle,
  fitSize,
  mediaTypeOf,
  refFileName,
  refMediaType,
} from "./refs";

describe("reference images", () => {
  it("shrinks only images larger than the limit", () => {
    expect(fitSize(3000, 2000)).toEqual({ width: 1568, height: 1045 });
    expect(fitSize(2000, 4000)).toEqual({ width: 784, height: 1568 });
    expect(fitSize(584, 704)).toEqual({ width: 584, height: 704 });
    expect(fitSize(10000, 1)).toEqual({ width: 1568, height: 1 });
  });

  it("sends photos as JPEG and everything else as PNG", () => {
    expect(refMediaType("image/jpeg")).toBe("image/jpeg");
    expect(refMediaType("image/heic")).toBe("image/jpeg");
    expect(refMediaType("image/png")).toBe("image/png");
    expect(refMediaType("image/webp")).toBe("image/png");
    expect(refMediaType("")).toBe("image/png");
  });

  it("names saved files by position and type", () => {
    expect(refFileName(0, "image/png")).toBe("1.png");
    expect(refFileName(2, "image/jpeg")).toBe("3.jpg");
    expect(mediaTypeOf("3.jpg")).toBe("image/jpeg");
    expect(mediaTypeOf("1.png")).toBe("image/png");
  });

  it("round-trips bytes through base64, including large ones", () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7) % 256);
    const data = bytesToBase64(bytes);
    expect(data.startsWith(btoa(String.fromCharCode(0, 7, 14)))).toBe(true);
    expect(base64ToBytes(data)).toEqual(bytes);
    expect(bytesToBase64([137, 80, 78, 71])).toBe("iVBORw==");
  });
});

describe("description drafts", () => {
  const draft = "主体：红色邮筒\n风格：物体\n尺寸：中（约 28 格）";

  it("goes after what is typed", () => {
    expect(appendDraft("", ` ${draft}\n`)).toBe(draft);
    expect(appendDraft("要矮一点\n", draft)).toBe(`要矮一点\n\n${draft}`);
  });

  it("reads the style line", () => {
    expect(draftStyle(draft)).toBe("object");
    expect(draftStyle("风格: Q 版人物")).toBe("chibi");
    expect(draftStyle("风格：场景小件")).toBe("diorama");
    expect(draftStyle("风格：Q 版人物 | 物体 | 场景")).toBeNull();
    expect(draftStyle("主体：邮筒")).toBeNull();
  });
});
