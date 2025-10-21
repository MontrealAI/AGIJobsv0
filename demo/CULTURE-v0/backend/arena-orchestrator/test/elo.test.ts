import { describe, expect, it } from "vitest";
import { eloUpdate, expectedScore } from "../src/elo";

describe("eloUpdate", () => {
  it("raises rating for winner and lowers for loser", () => {
    const [newA, newB] = eloUpdate({ ratingA: 1200, ratingB: 1200, scoreA: 1 });
    expect(newA).toBeGreaterThan(1200);
    expect(newB).toBeLessThan(1200);
  });

  it("is symmetric for equal ratings", () => {
    const [newA, newB] = eloUpdate({ ratingA: 1500, ratingB: 1500, scoreA: 0 });
    const [newB2, newA2] = eloUpdate({ ratingA: 1500, ratingB: 1500, scoreA: 1 });
    expect(newA).toBe(newA2);
    expect(newB).toBe(newB2);
  });

  it("throws for invalid denominator", () => {
    expect(() => eloUpdate({ ratingA: Number.POSITIVE_INFINITY, ratingB: 0, scoreA: 1 })).toThrow();
  });
});

describe("expectedScore", () => {
  it("returns 0.5 for equal ratings", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 5);
  });

  it("returns higher probability for stronger player", () => {
    expect(expectedScore(1600, 1200)).toBeGreaterThan(0.5);
  });
});
