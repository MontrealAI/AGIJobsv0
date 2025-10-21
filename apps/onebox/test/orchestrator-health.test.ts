import test from 'node:test';
import assert from 'node:assert/strict';

import { checkOrchestratorHealth } from '../src/lib/orchestratorHealth';

const responseOk = () => new Response('ok', { status: 200 });

const responseError = (status: number) => new Response('error', { status });

test('checkOrchestratorHealth returns missing when base is absent', async () => {
  const result = await checkOrchestratorHealth({ orchestratorBase: undefined });
  assert.deepEqual(result, { status: 'missing', error: null });
});

test('checkOrchestratorHealth hits metrics endpoint with token', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return responseOk();
  };

  const result = await checkOrchestratorHealth({
    orchestratorBase: 'https://demo.example/orchestrator',
    apiToken: 'secret',
    fetchImpl: fetchMock,
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.error, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, 'https://demo.example/orchestrator/metrics');
  assert.equal(calls[0]?.init?.method, 'GET');
  assert.deepEqual(calls[0]?.init?.headers, { Authorization: 'Bearer secret' });
  assert.ok(calls[0]?.init?.signal instanceof AbortSignal);
});

test('checkOrchestratorHealth strips trailing /onebox before hitting metrics', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return responseOk();
  };

  await checkOrchestratorHealth({
    orchestratorBase: 'https://demo.example/orchestrator/onebox',
    fetchImpl: fetchMock,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, 'https://demo.example/orchestrator/metrics');
});

test('checkOrchestratorHealth surfaces HTTP errors', async () => {
  const fetchMock: typeof fetch = async () => responseError(503);

  const result = await checkOrchestratorHealth({
    orchestratorBase: 'https://demo.example/orchestrator',
    fetchImpl: fetchMock,
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error, 'HTTP 503');
});

test('checkOrchestratorHealth forwards exception messages', async () => {
  const fetchMock: typeof fetch = async () => {
    throw new Error('network offline');
  };

  const result = await checkOrchestratorHealth({
    orchestratorBase: 'https://demo.example/orchestrator',
    fetchImpl: fetchMock,
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error, 'network offline');
});
