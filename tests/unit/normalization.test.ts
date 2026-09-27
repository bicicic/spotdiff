import { expect, it } from "vitest";
import { brightnessCorrection } from "../../src/image-processing/normalization";
it("同じ一様な画像のコントラストを変更しない", () => {
  const range = { low: 230, median: 230, high: 230 };
  expect(brightnessCorrection(range, range)).toEqual({ gain: 1, offset: 0 });
});
it("ほぼ一様な紙の微小ノイズをコントラスト変更に変換しない", () => {
  expect(
    brightnessCorrection(
      { low: 230, median: 230, high: 230 },
      { low: 219, median: 220, high: 221 },
    ),
  ).toEqual({ gain: 1, offset: 10 });
});
it("十分な明暗幅がある場合にゲインと中央値を合わせる", () => {
  expect(
    brightnessCorrection(
      { low: 50, median: 150, high: 250 },
      { low: 40, median: 120, high: 200 },
    ),
  ).toEqual({ gain: 1.25, offset: 0 });
});
