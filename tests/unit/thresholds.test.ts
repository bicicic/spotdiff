import { expect, it } from "vitest";
import {
  automaticThreshold,
  median,
} from "../../src/image-processing/thresholds";
it("中央値と空配列を扱う", () => {
  expect(median([])).toBe(0);
  expect(median([9, 1, 5])).toBe(5);
  expect(median([1, 9])).toBe(5);
});
it("感度を上げると閾値は下がる", () => {
  const s = [0, 3, 8, 12, 30];
  expect(automaticThreshold(s, 100)).toBeLessThan(automaticThreshold(s, 0));
});
it("一様な画像やMADゼロでも数値ノイズを拾わない", () => {
  expect(automaticThreshold([0, 0, 0], 100)).toBeGreaterThan(0);
});
it("少数の大きな差で閾値が大きく変わらない", () => {
  const background = Array.from({ length: 99 }, (_, i) => i % 5);
  expect(automaticThreshold([...background, 1000], 50)).toBe(
    automaticThreshold([...background, 4], 50),
  );
});
