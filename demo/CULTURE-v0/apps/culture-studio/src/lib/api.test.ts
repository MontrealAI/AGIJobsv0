import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as api from './api.js';
import * as preview from './preview.js';
const fetchMock = vi.fn();
const response = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 503,
  text: async () => JSON.stringify(body),
});
beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'false');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  api.setServiceToken('');
  preview.resetPreview();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('service transport and schema boundaries', () => {
  test('uses explicit service capabilities without assuming providers', async () => {
    const value = {
      mode: 'local-adapters',
      generation: false,
      upload: false,
      mint: false,
      derivativeJobs: false,
      ownerControls: false,
    };
    fetchMock.mockResolvedValue(response(value));
    expect(await api.fetchCapabilities()).toEqual(value);
  });
  test('token only reaches the orchestrator; redirects and cookies are blocked', async () => {
    api.setServiceToken(' test-token ');
    fetchMock.mockResolvedValueOnce(response({ cid: 'bafy123', bytes: 7 }));
    await api.uploadToIpfs('content');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer test-token' },
      redirect: 'error',
      credentials: 'omit',
    });
    fetchMock.mockResolvedValueOnce(response({ data: { artifacts: [] } }));
    await api.fetchArtifacts();
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });
  test('maps GraphQL lineage without silently discarding errors', async () => {
    fetchMock.mockResolvedValue(
      response({
        data: {
          artifacts: [
            {
              id: '7',
              cid: 'bafysource',
              parentId: '2',
              citations: [{ to: { id: '3' } }],
              influence: 0.75,
              mintedAt: '2026-10-04',
              kind: 'prompt',
            },
            { id: '9' },
          ],
        },
      }),
    );
    expect(await api.fetchArtifacts()).toMatchObject([
      { id: 7, parentId: 2, cites: [3], influence: 0.75 },
      {
        id: 9,
        cid: '',
        kind: 'book',
        influence: 0,
        title: 'Untitled Artifact',
      },
    ]);
    fetchMock.mockResolvedValue(
      response({
        errors: [{ message: 'partial data' }],
        data: { artifacts: [] },
      }),
    );
    await expect(api.fetchArtifacts()).rejects.toThrow('GraphQL');
    fetchMock.mockResolvedValue(response({ data: {} }));
    await expect(api.fetchArtifacts()).rejects.toThrow('artifact data');
  });
  test.each([null, '', '9007199254740993', -1, 'bad'])(
    'rejects invalid identifiers %s',
    async (id) => {
      fetchMock.mockResolvedValue(response({ data: { artifacts: [{ id }] } }));
      await expect(api.fetchArtifacts()).rejects.toThrow('invalid artifact ID');
    },
  );
  test.each([-1, 'not-a-number'])(
    'rejects malformed influence %s',
    async (influence) => {
      fetchMock.mockResolvedValue(
        response({ data: { artifacts: [{ id: 1, influence }] } }),
      );
      await expect(api.fetchArtifacts()).rejects.toThrow('invalid influence');
    },
  );
  test('maps the real orchestrator scoreboard schema', async () => {
    fetchMock.mockResolvedValue(
      response({
        agents: [{ address: 'a', rating: 1208, stats: { wins: 1, losses: 0 } }],
        rounds: [{ id: 1, successRate: 0.5 }],
        currentDifficulty: 4,
        difficultyWindow: { targetSuccessRate: 0.7 },
      }),
    );
    expect(await api.fetchScoreboard()).toMatchObject({
      agents: [{ role: 'participant', wins: 1, losses: 0 }],
      currentSuccessRate: 0.5,
      ownerControls: { targetSuccessRate: 0.7 },
    });
    fetchMock.mockResolvedValue(
      response({ agents: [], rounds: [], currentDifficulty: 1 }),
    );
    expect((await api.fetchScoreboard()).currentSuccessRate).toBe(0);
    const complete = preview.previewScoreboard();
    fetchMock.mockResolvedValue(response(complete));
    expect(await api.fetchScoreboard()).toEqual(complete);
    fetchMock.mockResolvedValue(
      response({ agents: [], rounds: [], currentDifficulty: 'bad' }),
    );
    await expect(api.fetchScoreboard()).rejects.toThrow('invalid telemetry');
  });
  test('provider adapters preserve explicit results', async () => {
    fetchMock.mockResolvedValueOnce(response({ segments: ['a', 'b'] }));
    const chunks = [];
    for await (const chunk of api.streamLLMCompletion({ prompt: 'hello' }))
      chunks.push(chunk);
    expect(chunks).toEqual(['a', 'b']);
    fetchMock.mockResolvedValueOnce(
      response({ artifactId: 10, transactionHash: 'confirmed' }),
    );
    expect(
      (
        await api.mintCultureArtifact({
          title: 'Guide',
          kind: 'book',
          cid: 'bafy',
        })
      ).artifactId,
    ).toBe(10);
    fetchMock.mockResolvedValueOnce(
      response({ jobId: 'job-1', title: 'Evaluate' }),
    );
    expect((await api.createDerivativeJob(10)).jobId).toBe('job-1');
    fetchMock.mockResolvedValueOnce(response({ paused: true }));
    expect((await api.updateOwnerControls({ paused: true })).paused).toBe(true);
  });
  test('service rounds require separate explicit lifecycle actions', async () => {
    await expect(
      api.launchArena({ artifactId: 1, studentCount: 2 }),
    ).rejects.toThrow('preview-only');
    expect(fetchMock).not.toHaveBeenCalled();
    const round = { id: 12, status: 'open' };
    fetchMock.mockResolvedValueOnce(response({ round }));
    expect(
      await api.startServiceRound({
        artifactId: 1,
        teacher: 'teacher',
        students: ['student'],
        validators: [],
        difficultyOverride: 3,
      }),
    ).toEqual(round);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).difficultyOverride).toBe(
      3,
    );
    fetchMock.mockResolvedValue(response(round));
    await api.loadServiceRound(12);
    await api.submitServiceWork(12, 'student', 'bafy-evidence');
    await api.closeServiceRound(12);
    await api.finalizeServiceRound(12, ['student']);
    expect(
      fetchMock.mock.calls.map(([url]) => url.split('/arena/')[1]),
    ).toEqual(['start', 'status/12', 'submit/12', 'close/12', 'finalize/12']);
  });
  test.each([
    () => api.fetchArtifacts(),
    () => api.fetchScoreboard(),
    () => api.uploadToIpfs('text'),
    () => api.createDerivativeJob(1),
    () =>
      api.mintCultureArtifact({ title: 'Guide', kind: 'book', cid: 'bafy' }),
    () => api.updateOwnerControls({ paused: true }),
  ])(
    'never converts connection errors into fictional success',
    async (operation) => {
      fetchMock.mockRejectedValue(new Error('offline'));
      await expect(operation()).rejects.toThrow('offline');
    },
  );
  test('HTTP, empty and invalid JSON responses fail visibly', async () => {
    fetchMock.mockResolvedValue(response({}, false));
    await expect(api.fetchScoreboard()).rejects.toThrow('503');
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' });
    await expect(api.uploadToIpfs('x')).rejects.toThrow('empty response');
    fetchMock.mockResolvedValue({ ok: true, text: async () => '<html>' });
    await expect(api.uploadToIpfs('x')).rejects.toThrow();
  });
  test('aborts a stalled request after 15 seconds', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          ),
        ),
    );
    const result = expect(api.fetchScoreboard()).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(15000);
    await result;
  });
});

describe('complete offline learning loop', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
  });
  test('draft → fingerprint → artifact → job → scored round → graph → evidence', async () => {
    const chunks = [];
    for await (const chunk of api.streamLLMCompletion({
      prompt: 'Teach citation literacy',
      persona: 'Community storyteller',
    }))
      chunks.push(chunk);
    const draft = chunks.join('');
    expect(draft).toContain('Teach citation literacy');
    expect(draft).toContain('Community storyteller');
    const stored = await api.uploadToIpfs(draft);
    expect(stored.cid).toMatch(/^preview-sha256-[a-f0-9]{64}$/);
    expect(await api.uploadToIpfs(draft)).toEqual(stored);
    const minted = await api.mintCultureArtifact({
      title: 'Citation literacy',
      kind: 'book',
      cid: stored.cid,
      parentId: 2,
    });
    expect(minted).toEqual({
      artifactId: 4,
      transactionHash: 'preview-registration-4',
    });
    expect((await api.fetchArtifacts()).at(-1)).toMatchObject({
      id: 4,
      title: 'Citation literacy',
      parentId: 2,
      cites: [2],
    });
    await api.createDerivativeJob(4);
    const result = await api.launchArena({
      artifactId: 4,
      studentCount: 6,
      difficultyTarget: 0.7,
    });
    const evidence = preview.previewEvidence();
    expect(evidence.mode).toBe('simulation');
    expect(evidence.contents[stored.cid]).toBe(draft);
    expect(evidence.jobs).toHaveLength(1);
    expect(result.observedSuccessRate).toBe(result.winners.length / 6);
    expect(
      evidence.rounds[0].submissions
        .filter((s) => s.passed)
        .map((s) => s.participant),
    ).toEqual(result.winners);
    const board = await api.fetchScoreboard();
    expect(board.rounds[0].status).toBe('finalized');
    expect(board.currentSuccessRate).toBe(result.observedSuccessRate);
    expect(board.agents.reduce((sum, a) => sum + a.rating, 0)).toBe(1200 * 7);
    expect(api.buildTelemetry(board).difficultyTrend[0].value).toBe(
      result.difficulty,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test('pause, hold, target and concurrency persist and affect future rounds', async () => {
    await api.updateOwnerControls({ paused: true });
    await expect(
      api.launchArena({ artifactId: 1, studentCount: 2 }),
    ).rejects.toThrow('paused');
    await api.updateOwnerControls({ autoDifficulty: false });
    expect((await api.fetchScoreboard()).ownerControls.paused).toBe(true);
    await api.updateOwnerControls({
      paused: false,
      maxConcurrentJobs: 1,
      targetSuccessRate: 0.8,
    });
    const round = await api.launchArena({ artifactId: 1, studentCount: 3 });
    expect(round.difficultyDelta).toBe(0);
    expect(preview.previewEvidence().rounds[0].batches).toBe(3);
    expect(preview.previewEvidence().rounds[0].target).toBe(0.8);
  });
  test('repeatable reset, bounded difficulty, stable influence and isolated evidence copies', async () => {
    const first = await api.launchArena({
      artifactId: 2,
      studentCount: 12,
      difficultyTarget: 0.1,
    });
    for (let i = 0; i < 25; i += 1) {
      const round = await api.launchArena({
        artifactId: 2,
        studentCount: 12,
        difficultyTarget: i % 2 ? 0.95 : 0.1,
      });
      expect(Math.abs(round.difficultyDelta)).toBeLessThanOrEqual(2);
      expect(round.difficulty).toBeGreaterThanOrEqual(1);
      expect(round.difficulty).toBeLessThanOrEqual(9);
    }
    const telemetry = api.buildTelemetry(await api.fetchScoreboard());
    expect(telemetry.successTrend).toHaveLength(8);
    expect(
      (await api.fetchArtifacts()).reduce((total, a) => total + a.influence, 0),
    ).toBeCloseTo(1, 10);
    preview.previewEvidence().artifacts.length = 0;
    expect(await api.fetchArtifacts()).toHaveLength(3);
    preview.resetPreview();
    expect(
      await api.launchArena({
        artifactId: 2,
        studentCount: 12,
        difficultyTarget: 0.1,
      }),
    ).toEqual(first);
  });
  test('change subscriptions stop on unsubscribe', () => {
    const listener = vi.fn();
    const initial = preview.previewRevision();
    const unsubscribe = preview.subscribePreview(listener);
    preview.resetPreview();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(preview.previewRevision()).toBeGreaterThan(initial);
    unsubscribe();
    preview.resetPreview();
    expect(listener).toHaveBeenCalledTimes(1);
  });
  test('rejects missing content, invalid lineage, duplicates, inputs and controls', async () => {
    expect(() => preview.previewDraft({ prompt: ' ' })).toThrow();
    expect(preview.previewDraft({ prompt: 'Teach' }).join('')).toContain(
      'Friendly research partner',
    );
    await expect(api.uploadToIpfs(' ')).rejects.toThrow();
    const stored = await api.uploadToIpfs('Lesson');
    for (const input of [
      { title: '', kind: 'book', cid: stored.cid },
      { title: 'x', kind: 'bad', cid: stored.cid },
      { title: 'x', kind: 'book', cid: 'missing' },
      { title: 'x', kind: 'book', cid: stored.cid, parentId: 999 },
    ])
      await expect(api.mintCultureArtifact(input)).rejects.toThrow();
    await api.mintCultureArtifact({
      title: 'Original',
      kind: 'book',
      cid: stored.cid,
    });
    await expect(
      api.mintCultureArtifact({
        title: 'Duplicate',
        kind: 'book',
        cid: stored.cid,
      }),
    ).rejects.toThrow('already');
    await expect(api.createDerivativeJob(999)).rejects.toThrow();
    await expect(
      api.launchArena({ artifactId: 999, studentCount: 2 }),
    ).rejects.toThrow();
    for (const count of [0, 13, 2.5, NaN])
      await expect(
        api.launchArena({ artifactId: 1, studentCount: count }),
      ).rejects.toThrow();
    for (const target of [0, 1, NaN])
      await expect(
        api.launchArena({
          artifactId: 1,
          studentCount: 2,
          difficultyTarget: target,
        }),
      ).rejects.toThrow();
    for (const update of [
      { targetSuccessRate: NaN },
      { targetSuccessRate: 0 },
      { targetSuccessRate: 1 },
      { maxConcurrentJobs: 0 },
      { maxConcurrentJobs: 13 },
      { maxConcurrentJobs: 1.5 },
      { paused: 'yes' },
      { autoDifficulty: 'yes' },
    ])
      await expect(api.updateOwnerControls(update as never)).rejects.toThrow();
    expect(
      api.buildTelemetry(preview.previewScoreboard()).difficultyTrend,
    ).toEqual([]);
  });
});
