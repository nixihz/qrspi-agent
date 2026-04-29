import { describe, expect, it } from "vitest";

import {
  buildDependencyContextPlans,
  getStageContextProfile,
} from "../../src/context/context-profiles.js";
import { getStageDependencies } from "../../src/workflow/stage-schema.js";
import type { StageCode } from "../../src/workflow/types.js";

describe("context profiles", () => {
  it.each([
    ["P", [["Q", "summary"], ["R", "summary"], ["D", "focused"], ["S", "full"]]],
    ["W", [["Q", "pointer"], ["R", "pointer"], ["D", "summary"], ["S", "focused"], ["P", "full"]]],
    ["I", [["Q", "summary"], ["R", "summary"], ["D", "summary"], ["S", "focused"], ["P", "full"], ["W", "full"]]],
    ["PR", [["Q", "pointer"], ["R", "pointer"], ["D", "summary"], ["S", "summary"], ["P", "focused"], ["W", "focused"], ["I", "full"]]],
  ] as const)("maps %s dependencies to stable context layers", (stage, expected) => {
    const plans = buildDependencyContextPlans(
      stage,
      getStageDependencies(stage),
      getStageContextProfile(stage),
    );

    expect(plans.map((plan) => [plan.dependency.stage, plan.layer])).toEqual(expected);
    expect(plans.map((plan) => plan.dependency.stage)).toEqual(expected.map(([dep]) => dep));
  });

  it("keeps early stages in full compatibility behavior", () => {
    const stage: StageCode = "S";
    const plans = buildDependencyContextPlans(
      stage,
      getStageDependencies(stage),
      getStageContextProfile(stage),
    );

    expect(plans.map((plan) => plan.layer)).toEqual(["full", "full", "full"]);
  });
});
