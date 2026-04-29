import { describe, expect, it } from "vitest";

import {
  calculateContextBudgetLimit,
  createDefaultContextBudgetConfig,
  estimateContextSize,
} from "../../src/context/context-budget.js";

describe("context budget basics", () => {
  it("creates the default layered character budget", () => {
    const config = createDefaultContextBudgetConfig();

    expect(config.mode).toBe("layered");
    expect(config.unit).toBe("character");
    expect(config.targetUtilization).toBe(0.4);
    expect(config.switchThresholdUtilization).toBe(0.6);
  });

  it("supports full mode overrides", () => {
    const config = createDefaultContextBudgetConfig({
      mode: "full",
      maxContextSize: 1000,
    });

    expect(config.mode).toBe("full");
    expect(calculateContextBudgetLimit(config)).toMatchObject({
      targetSize: 400,
      switchThresholdSize: 600,
      maxContextSize: 1000,
      targetPercent: 40,
      switchThresholdPercent: 60,
    });
  });

  it("estimates characters and lines without tokenizer dependencies", () => {
    expect(estimateContextSize("one\ntwo")).toEqual({
      characters: 7,
      lines: 2,
    });
  });
});
