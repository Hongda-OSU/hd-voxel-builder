import { describe, expect, it } from "vitest";
import { shortTime } from "./labels";

describe("shortTime", () => {
  const now = new Date(2026, 10, 5, 23, 30);
  const iso = (d: Date) => d.toISOString();

  it("names today and yesterday, then falls back to the date", () => {
    expect(shortTime(iso(new Date(2026, 10, 5, 9, 5)), now)).toBe("今天 09:05");
    expect(shortTime(iso(new Date(2026, 10, 4, 23, 59)), now)).toBe("昨天 23:59");
    expect(shortTime(iso(new Date(2026, 10, 3, 12, 0)), now)).toBe("11-03");
    expect(shortTime("not a date", now)).toBe("");
  });
});
