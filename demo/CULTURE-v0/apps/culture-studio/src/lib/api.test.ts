import { describe, expect, beforeEach, vi, test } from "vitest";
import {
  fetchArtifacts,
  streamLLMCompletion,
  uploadToIpfs,
  createDerivativeJob,
  launchArena,
  buildTelemetry,
  updateOwnerControls,
  fetchScoreboard,
  mintCultureArtifact,
} from "./api";

const fetchMock = vi.fn();

function mockJsonResponse(body: unknown, ok = true) {
  const payload = JSON.stringify(body);
  return {
    ok,
    status: ok ? 200 : 500,
    text: async () => payload,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

describe("api helpers", () => {
  test("fetchArtifacts returns fallback data when indexer unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    const artifacts = await fetchArtifacts();
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].title).toMatch(/Artifact/);
  });

  test("streamLLMCompletion yields provided segments", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ segments: ["a", "b"] }));
    const iterator = streamLLMCompletion({ prompt: "Hello" });
    const segments: string[] = [];
    for await (const segment of iterator) {
      segments.push(segment);
    }
    expect(segments).toEqual(["a", "b"]);
  });

  test("uploadToIpfs falls back when orchestrator errors", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    const result = await uploadToIpfs("demo content");
    expect(result.cid).toMatch(/^bafy/);
    expect(result.bytes).toBeGreaterThan(0);
  });

  test("mintCultureArtifact returns fallback tx on failure", async () => {
    fetchMock.mockRejectedValue(new Error("rpc"));
    const result = await mintCultureArtifact({ title: "Test", kind: "book", cid: "cid" });
    expect(result.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  test("createDerivativeJob forwards artifact id", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ jobId: "job-123", title: "custom" }));
    const result = await createDerivativeJob(123);
    expect(result.jobId).toBe("job-123");
  });

  test("launchArena orchestrates round lifecycle", async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({ round: { id: 42 } }))
      .mockResolvedValueOnce(mockJsonResponse({ ok: true }))
      .mockResolvedValueOnce(
        mockJsonResponse({
          roundId: 42,
          winners: ["0xstudent00"],
          difficulty: 0.7,
          observedSuccessRate: 0.6,
          difficultyDelta: 0.1,
        })
      );
    const summary = await launchArena({ artifactId: 7, studentCount: 2, difficultyTarget: 0.7 });
    expect(summary.roundId).toBe(42);
    expect(summary.winners).toContain("0xstudent00");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("buildTelemetry charts last rounds", () => {
    const telemetry = buildTelemetry({
      agents: [],
      rounds: [
        { id: 1, difficulty: 0.5, successRate: 0.6, difficultyDelta: 0.1, status: "completed" },
        { id: 2, difficulty: 0.7, successRate: 0.55, difficultyDelta: 0.05, status: "completed" },
      ],
      currentDifficulty: 0.7,
      currentSuccessRate: 0.55,
      ownerControls: { paused: false, autoDifficulty: true, maxConcurrentJobs: 2, targetSuccessRate: 0.6 },
    });
    expect(telemetry.difficultyTrend.map((point) => point.value)).toEqual([0.5, 0.7]);
    expect(telemetry.successTrend.map((point) => point.label)).toEqual(["#1", "#2"]);
  });

  test("updateOwnerControls falls back to defaults", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const result = await updateOwnerControls({ paused: true, targetSuccessRate: 0.65 });
    expect(result.paused).toBe(true);
    expect(result.targetSuccessRate).toBeCloseTo(0.65);
  });

  test("fetchScoreboard returns fallback when orchestrator unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const scoreboard = await fetchScoreboard();
    expect(scoreboard.agents).not.toHaveLength(0);
    expect(scoreboard.ownerControls.autoDifficulty).toBe(true);
  });
});
