import { jest } from '@jest/globals';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { ArenaInputError, ArenaService } from '../src/arena.service.js';
import { buildRouter } from '../src/router.js';
const teacher = `0x${'11'.repeat(20)}`;
const student = `0x${'22'.repeat(20)}`;
const token = 'local-test-token-with-at-least-thirty-two-characters';
const methods = {
  startRound: jest.fn<(...args: any[]) => Promise<any>>(),
  closeRound: jest.fn<(...args: any[]) => Promise<any>>(),
  recordSubmission: jest.fn<(...args: any[]) => Promise<any>>(),
  finalizeRound: jest.fn<(...args: any[]) => Promise<any>>(),
  getScoreboard: jest.fn(),
  getRound: jest.fn(),
};
let server: http.Server, base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(buildRouter(methods as unknown as ArenaService, token));
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  Object.values(methods).forEach((method) => method.mockReset());
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const post = (route: string, body: unknown, authenticated = true) =>
  fetch(base + route, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
test('health and capabilities are public and accurately report local adapters', async () => {
  expect((await fetch(base + '/healthz')).status).toBe(200);
  expect(await (await fetch(base + '/capabilities')).json()).toMatchObject({
    mode: 'local-adapters',
    mint: false,
    generation: false,
    ownerControls: false,
  });
});
test('unauthorized writes fail before reaching the service', async () => {
  expect((await post('/arena/start', {}, false)).status).toBe(401);
  expect(methods.startRound).not.toHaveBeenCalled();
});
test('valid start forwards integer difficulty and real participant addresses', async () => {
  const input = {
    artifactId: 1,
    teacher,
    students: [student],
    validators: [],
    difficultyOverride: 3,
  };
  methods.startRound.mockResolvedValue({ id: 1 });
  const result = await post('/arena/start', input);
  expect(result.status).toBe(201);
  expect(methods.startRound).toHaveBeenCalledWith(input);
});
test.each([
  { artifactId: 0, teacher, students: [student] },
  { artifactId: 1, teacher: '0xteacher', students: [student] },
  { artifactId: 1, teacher, students: [student], targetDifficulty: 0.6 },
])('rejects invalid and obsolete start payloads', async (input) => {
  expect((await post('/arena/start', input)).status).toBe(400);
  expect(methods.startRound).not.toHaveBeenCalled();
});
test('forwards explicit submission, close and reviewed finalization', async () => {
  methods.recordSubmission.mockResolvedValue(undefined);
  methods.closeRound.mockResolvedValue({ id: 1, status: 'closed' });
  methods.finalizeRound.mockResolvedValue({ roundId: 1 });
  expect(
    (
      await post('/arena/submit/1', {
        participant: teacher,
        cid: 'cid:teacher',
      })
    ).status,
  ).toBe(200);
  expect(methods.recordSubmission).toHaveBeenCalledWith(
    1,
    teacher,
    'cid:teacher',
  );
  expect((await post('/arena/close/1', {})).status).toBe(200);
  expect((await post('/arena/finalize/1', { winners: [] })).status).toBe(200);
  expect(methods.finalizeRound).toHaveBeenCalledWith(1, []);
  expect((await post('/arena/finalize/1', {})).status).toBe(400);
});
test.each(['/arena/close/NaN', '/arena/submit/-1', '/arena/finalize/1.5'])(
  'rejects malformed round IDs: %s',
  async (route) => {
    expect((await post(route, {})).status).toBe(400);
  },
);
test('reads scoreboard and validates status IDs', async () => {
  methods.getScoreboard.mockReturnValue({ rounds: [] });
  methods.getRound.mockReturnValue({ id: 1 });
  expect(await (await fetch(base + '/arena/scoreboard')).json()).toEqual({
    rounds: [],
  });
  expect(await (await fetch(base + '/arena/status/1')).json()).toEqual({
    id: 1,
  });
  expect((await fetch(base + '/arena/status/0')).status).toBe(400);
});
test('domain conflicts are client errors and unexpected failures remain failures', async () => {
  methods.closeRound.mockRejectedValue(new ArenaInputError('Round is closed'));
  expect((await post('/arena/close/1', {})).status).toBe(400);
  methods.recordSubmission.mockRejectedValue(new Error('provider unavailable'));
  expect(
    (
      await post('/arena/submit/1', {
        participant: student,
        cid: 'cid:student',
      })
    ).status,
  ).toBe(500);
  methods.finalizeRound.mockRejectedValue('unknown');
  expect((await post('/arena/finalize/1', { winners: [] })).status).toBe(500);
});
