import { describe, expect, beforeEach, afterEach, vi, test } from 'vitest';
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
  setServiceToken,
} from './api';

const fetchMock = vi.fn();
afterEach(() => {
  vi.unstubAllGlobals();
});

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
  setServiceToken('');
  vi.stubEnv('VITE_DEMO_MODE', 'false');
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
});

describe('api helpers', () => {
  test('fetchArtifacts returns fallback data when indexer unavailable', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    fetchMock.mockRejectedValue(new Error('boom'));
    const artifacts = await fetchArtifacts();
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].title).toMatch(/Artifact/);
  });

  test('streamLLMCompletion yields provided segments', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ segments: ['a', 'b'] }));
    const iterator = streamLLMCompletion({ prompt: 'Hello' });
    const segments: string[] = [];
    for await (const segment of iterator) {
      segments.push(segment);
    }
    expect(segments).toEqual(['a', 'b']);
  });

  test('uploadToIpfs offers an explicitly simulated preview', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    fetchMock.mockRejectedValue(new Error('timeout'));
    const result = await uploadToIpfs('demo content');
    expect(result.cid).toMatch(/^bafy/);
    expect(result.bytes).toBeGreaterThan(0);
  });

  test('mintCultureArtifact offers an explicitly simulated preview', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    fetchMock.mockRejectedValue(new Error('rpc'));
    const result = await mintCultureArtifact({
      title: 'Test',
      kind: 'book',
      cid: 'cid',
    });
    expect(result.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  test('createDerivativeJob forwards artifact id', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ jobId: 'job-123', title: 'custom' }),
    );
    const result = await createDerivativeJob(123);
    expect(result.jobId).toBe('job-123');
  });

  test('launchArena orchestrates round lifecycle', async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({ round: { id: 42 } }))
      .mockResolvedValueOnce(mockJsonResponse({ ok: true }))
      .mockResolvedValueOnce(
        mockJsonResponse({
          roundId: 42,
          winners: ['0xstudent00'],
          difficulty: 0.7,
          observedSuccessRate: 0.6,
          difficultyDelta: 0.1,
        }),
      );
    const summary = await launchArena({
      artifactId: 7,
      studentCount: 2,
      difficultyTarget: 0.7,
    });
    expect(summary.roundId).toBe(42);
    expect(summary.winners).toContain('0xstudent00');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('buildTelemetry charts last rounds', () => {
    const telemetry = buildTelemetry({
      agents: [],
      rounds: [
        {
          id: 1,
          difficulty: 0.5,
          successRate: 0.6,
          difficultyDelta: 0.1,
          status: 'completed',
        },
        {
          id: 2,
          difficulty: 0.7,
          successRate: 0.55,
          difficultyDelta: 0.05,
          status: 'completed',
        },
      ],
      currentDifficulty: 0.7,
      currentSuccessRate: 0.55,
      ownerControls: {
        paused: false,
        autoDifficulty: true,
        maxConcurrentJobs: 2,
        targetSuccessRate: 0.6,
      },
    });
    expect(telemetry.difficultyTrend.map((point) => point.value)).toEqual([
      0.5, 0.7,
    ]);
    expect(telemetry.successTrend.map((point) => point.label)).toEqual([
      '#1',
      '#2',
    ]);
  });

  test('updateOwnerControls falls back to defaults', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    fetchMock.mockRejectedValue(new Error('offline'));
    const result = await updateOwnerControls({
      paused: true,
      targetSuccessRate: 0.65,
    });
    expect(result.paused).toBe(true);
    expect(result.targetSuccessRate).toBeCloseTo(0.65);
  });

  test('fetchScoreboard returns fallback when orchestrator unreachable', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    fetchMock.mockRejectedValue(new Error('network'));
    const scoreboard = await fetchScoreboard();
    expect(scoreboard.agents).not.toHaveLength(0);
    expect(scoreboard.ownerControls.autoDifficulty).toBe(true);
  });
});

describe('service mode failure handling', () => {
  test('sends the operator token only to the configured orchestrator', async () => {
    setServiceToken('local-test-token');
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ cid: 'cid', bytes: 7 }));
    await uploadToIpfs('content');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer local-test-token',
    );
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ data: { artifacts: [] } }),
    );
    await fetchArtifacts();
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });
  test('maps the indexer schema into graph links and influence scores', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        data: {
          artifacts: [
            {
              id: '7',
              cid: 'bafyexample',
              kind: 'book',
              parentId: '2',
              citations: [{ to: { id: '3' } }],
              influence: 0.75,
              mintedAt: '2026-10-03',
            },
          ],
        },
      }),
    );
    await expect(fetchArtifacts()).resolves.toMatchObject([
      {
        id: 7,
        parentId: 2,
        cites: [3],
        influence: 0.75,
        mintedAt: '2026-10-03',
      },
    ]);
  });
  test.each([
    [
      'mint',
      () => mintCultureArtifact({ title: 'Test', kind: 'book', cid: 'cid' }),
    ],
    ['upload', () => uploadToIpfs('content')],
    ['owner controls', () => updateOwnerControls({ paused: true })],
    ['derivative job', () => createDerivativeJob(7)],
    ['scoreboard', () => fetchScoreboard()],
  ])(
    'does not fabricate a successful %s after a network failure',
    async (_name, operation) => {
      fetchMock.mockRejectedValue(new Error('offline'));
      await expect(operation()).rejects.toThrow('offline');
    },
  );

  test('rejects empty responses to write requests', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' });
    await expect(uploadToIpfs('content')).rejects.toThrow('empty response');
  });

  test('rejects HTTP failures', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({}, false));
    await expect(
      mintCultureArtifact({ title: 'Test', kind: 'book', cid: 'cid' }),
    ).rejects.toThrow('500');
  });

  test('does not replace a GraphQL error with fictional artifacts', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({ errors: [{ message: 'invalid query' }] }),
    );
    await expect(fetchArtifacts()).rejects.toThrow('no artifact data');
  });

  test('preview writes never contact a service', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    await uploadToIpfs('content');
    await mintCultureArtifact({ title: 'Test', kind: 'book', cid: 'cid' });
    await updateOwnerControls({ paused: true });
    await launchArena({ artifactId: 1, studentCount: 2 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('read errors and optional service metadata', () => {
  test('surfaces HTTP errors from public telemetry reads', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({}, false));
    await expect(fetchScoreboard()).rejects.toThrow('500');
  });
  test('accepts public telemetry without requiring an operator token', async () => {
    const telemetry = {
      agents: [],
      rounds: [],
      currentDifficulty: 1,
      currentSuccessRate: 0,
    };
    fetchMock.mockResolvedValue(mockJsonResponse(telemetry));
    await expect(fetchScoreboard()).resolves.toEqual(telemetry);
    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
  });
  test('renders incomplete optional artifact metadata without NaN', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({ data: { artifacts: [{ id: '9' }] } }),
    );
    await expect(fetchArtifacts()).resolves.toMatchObject([
      {
        id: 9,
        title: 'Untitled Artifact',
        kind: 'book',
        cid: '',
        influence: 0,
        cites: [],
      },
    ]);
  });
  test('preview works in browsers without crypto.randomUUID', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    vi.stubGlobal('crypto', undefined);
    const mint = await mintCultureArtifact({
      title: 'Preview',
      kind: 'book',
      cid: 'cid',
    });
    expect(mint.transactionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test('preview preserves explicitly configured owner controls', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    const controls = {
      paused: false,
      autoDifficulty: false,
      maxConcurrentJobs: 1,
      targetSuccessRate: 0.8,
    };
    await expect(updateOwnerControls(controls)).resolves.toEqual(controls);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
