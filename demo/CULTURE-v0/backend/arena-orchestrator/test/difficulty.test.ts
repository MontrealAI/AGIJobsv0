import { describe, expect, it } from "vitest";
import { nextDifficulty, successRateFromOutcomes } from "../src/difficulty";

describe("successRateFromOutcomes", () => {
  it("handles zero students", () => {
    expect(successRateFromOutcomes(0, 0)).toBe(0);
  });

  it("caps at 100%", () => {
    expect(successRateFromOutcomes(5, 10)).toBe(10_000);
  });
});

describe("nextDifficulty", () => {
  const base = {
    current: 5,
    targetSuccessRate: 6000,
    observedSuccessRate: 6000,
    minDifficulty: 1,
    maxDifficulty: 20,
    maxStep: 3,
  } as const;

  it("keeps difficulty when on target", () => {
    expect(nextDifficulty({ ...base })).toBe(5);
  });

  it("increases difficulty when success rate too high", () => {
    expect(nextDifficulty({ ...base, observedSuccessRate: 9000 })).toBeGreaterThan(5);
  });

  it("decreases difficulty when success rate too low", () => {
    expect(nextDifficulty({ ...base, observedSuccessRate: 1000 })).toBeLessThan(5);
  });

  it("clamps within max step", () => {
    expect(nextDifficulty({ ...base, observedSuccessRate: 0, proportionalGain: 1 })).toBe(2);
  });

  it("throws on invalid bounds", () => {
    expect(() => nextDifficulty({ ...base, minDifficulty: 10, maxDifficulty: 1 })).toThrow();
  });
});
