import { describe, expect, it } from "vitest";
import { enhanceTagPixels, otsu } from "./ocr";

describe("tag image preprocess", () => {
  it("thresholds a high-contrast yellow tag to black digits on white", () => {
    const width = 8;
    const height = 2;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const dark = i % 8 < 3;
      const r = dark ? 20 : 244;
      const g = dark ? 20 : 196;
      const b = dark ? 20 : 48;
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    enhanceTagPixels(data, width, height);
    const first = data[0] ?? 0;
    const mid = data[4 * 4] ?? 0;
    expect(first === 0 || first === 255).toBe(true);
    expect(mid === 0 || mid === 255).toBe(true);
    expect(first).not.toBe(mid);
  });

  it("picks a mid-range Otsu split on a bimodal histogram", () => {
    const gray = new Uint8Array(200);
    gray.fill(20, 0, 100);
    gray.fill(220, 100, 200);
    const t = otsu(gray);
    expect(20).toBeLessThanOrEqual(t);
    expect(t).toBeLessThan(220);
  });
});
