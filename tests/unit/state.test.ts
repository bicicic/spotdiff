import { expect, it } from "vitest";
import { previousStep } from "../../src/app/state";
it("各工程から前の編集可能な工程へ戻る", () => {
  expect(previousStep("corners-first")).toBe("input");
  expect(previousStep("corners-second")).toBe("corners-first");
  expect(previousStep("processing")).toBe("corners-second");
  expect(previousStep("result")).toBe("corners-second");
});
