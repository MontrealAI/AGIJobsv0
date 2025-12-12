import { describe, expect, it } from "@jest/globals";

import { AdapterScorecard, computeCompositeScore, rankAdapters } from "../evaluation-pipeline";

describe("evaluation pipeline", () => {
  const baseAdapter: AdapterScorecard = {
    id: "frontier",
    provider: "FrontierLabs",
    safetyScore: 0.95,
    costUSDPer1KTokens: 0.02,
    latencyMs: 180,
    maxContext: 131_072,
    compositeScore: 0,
  };

  it("computes a stable composite score for well-formed adapters", () => {
    const score = computeCompositeScore(baseAdapter, 12);
    expect(score).toBeCloseTo(14.0185, 4);
  });

  it("ranks adapters by composite score with input validation", () => {
    const improvedLatency = { ...baseAdapter, id: "fast-path", latencyMs: 90 };
    const adapters = rankAdapters([baseAdapter, improvedLatency], 6);

    expect(adapters[0].id).toBe("fast-path");
    expect(adapters[0].compositeScore).toBeGreaterThan(adapters[1].compositeScore);
  });

  it("rejects invalid adapter payloads", () => {
    const invalid = { ...baseAdapter, costUSDPer1KTokens: 0 };
    expect(() => computeCompositeScore(invalid, 4)).toThrow("costUSDPer1KTokens must be positive");
  });
});
