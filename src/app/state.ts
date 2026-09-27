import type { Step } from "../types";
export function previousStep(step: Step): Step {
  return (
    {
      input: "input",
      "corners-first": "input",
      "corners-second": "corners-first",
      processing: "corners-second",
      result: "corners-second",
    } as const
  )[step];
}
