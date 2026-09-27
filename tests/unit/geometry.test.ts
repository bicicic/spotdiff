import { describe, expect, it } from "vitest";
import {
  commonSize,
  initialCorners,
  validQuad,
} from "../../src/image-processing/geometry";
import { quadMapping } from "../../src/ui/corner-preview";
import type { Quad } from "../../src/types";
describe("4隅指定", () => {
  it("初期値は有効で、呼び出し間で共有しない", () => {
    const q = initialCorners();
    expect(validQuad(q)).toBe(true);
    q[0].x = 0.2;
    expect(initialCorners()[0].x).toBe(0.05);
  });
  it("自己交差・反時計回り・狭すぎる・非数・画面外を拒否する", () => {
    const q = initialCorners();
    expect(validQuad([q[0], q[2], q[1], q[3]])).toBe(false);
    expect(validQuad([q[0], q[3], q[2], q[1]])).toBe(false);
    expect(
      validQuad(q.map((p) => ({ x: p.x * 0.01, y: p.y * 0.01 })) as Quad),
    ).toBe(false);
    expect(validQuad([{ x: NaN, y: 0 }, ...q.slice(1)] as Quad)).toBe(false);
    expect(validQuad([{ x: -0.1, y: 0 }, ...q.slice(1)] as Quad)).toBe(false);
  });
  it("異なる入力サイズから1600px以下の共通寸法を得る", () => {
    const q = initialCorners();
    const size = commonSize(q, 4000, 3000, q, 1600, 1200);
    expect(size.width).toBeLessThanOrEqual(1600);
    expect(size.width / size.height).toBeCloseTo(4 / 3, 2);
  });
  it("縦長画像を保持する", () => {
    const q = initialCorners();
    const size = commonSize(q, 300, 1500, q, 400, 1600);
    expect(size.height).toBeGreaterThan(size.width);
    expect(size.height).toBeLessThanOrEqual(1600);
  });
  it("プレビューの射影変換が4隅と一致する", () => {
    const q: Quad = [
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.1 },
      { x: 0.8, y: 0.9 },
      { x: 0.2, y: 0.8 },
    ];
    const map = quadMapping(q);
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].forEach(([u, v], i) => {
      expect(map(u, v).x).toBeCloseTo(q[i].x);
      expect(map(u, v).y).toBeCloseTo(q[i].y);
    });
  });
});
