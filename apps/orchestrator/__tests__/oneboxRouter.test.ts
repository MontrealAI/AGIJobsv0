import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { ethers } from 'ethers';
import type { Wallet } from 'ethers';
import express from 'express';
import request from 'supertest';
import type { IntentEnvelope } from '../../../packages/onebox-orchestrator/src/ics/types';
import type { PlanResponse, StatusResponse } from '../../../packages/onebox-sdk/src';
import {
  createOneboxRouter,
  plannerIntentToJobIntent,
  formatDeadline,
  mapJobStateToStatus,
  DefaultOneboxService,
} from '../oneboxRouter';
import { resetMetrics } from '../oneboxMetrics';
import { finalizeJob } from '../submission';
import * as execution from '../execution';
import * as employer from '../employer';

test('plannerIntentToJobIntent converts create_job envelope', () => {
  const envelope: IntentEnvelope = {
    intent: 'create_job',
    payload: {
      intent: 'create_job',
      params: {
        job: {
          title: 'Label 500 images',
          description: 'Provide binary labels for 500 sample images.',
          rewardAmount: '5',
          rewardTokenSymbol: 'AGIALPHA',
          deadlineDays: 7,
          attachments: ['ipfs://bafyExample'],
        },
        autoApprove: true,
      },
      confirm: true,
      confirmationText: 'Post the image labelling job for 5 AGIALPHA with a 7 day deadline.',
    },
  };

  const intent = plannerIntentToJobIntent(envelope);
  assert.equal(intent.action, 'post_job');
  assert.equal(intent.payload?.title, 'Label 500 images');
  assert.equal(intent.payload?.deadlineDays, 7);
  assert.ok(Array.isArray(intent.payload?.attachments));
});

test('formatDeadline renders relative descriptions', () => {
  const twoHours = BigInt(Math.floor(Date.now() / 1000) + 2 * 3600);
  const message = formatDeadline(twoHours);
  assert.ok(message.startsWith('in'));
});

test('mapJobStateToStatus returns sensible defaults', () => {
  assert.equal(mapJobStateToStatus(1).code, 'open');
  assert.equal(mapJobStateToStatus(99).code, 'none');
});

test('onebox router plan route delegates to service', async () => {
  const planResponse: PlanResponse = {
    summary: 'Summary',
    intent: { action: 'post_job', payload: {} },
    requiresConfirmation: true,
    warnings: [],
  };

  const router = createOneboxRouter({
    async plan() {
      return planResponse;
    },
    async execute() {
      return { ok: true };
    },
    async status(): Promise<StatusResponse> {
      return { jobs: [] };
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/onebox', router);

  const response = await request(app).post('/onebox/plan').send({ text: 'Create a job' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.summary, planResponse.summary);
});

test('metrics endpoint exposes Prometheus counters', async () => {
  resetMetrics();

  const router = createOneboxRouter({
    async plan() {
      return {
        summary: 'Summary',
        intent: { action: 'post_job', payload: {} },
        requiresConfirmation: true,
        warnings: [],
      } satisfies PlanResponse;
    },
    async execute() {
      return { ok: true };
    },
    async status(): Promise<StatusResponse> {
      return { jobs: [] };
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/onebox', router);

  await request(app).post('/onebox/plan').send({ text: 'Create a job' });
  await request(app)
    .post('/onebox/execute')
    .send({ intent: { action: 'post_job', payload: {} }, mode: 'relayer' });
  await request(app).get('/onebox/status');

  const metricsResponse = await request(app).get('/onebox/metrics');
  assert.equal(metricsResponse.status, 200);
  assert.equal(metricsResponse.headers['content-type'], 'text/plain; version=0.0.4; charset=utf-8');
  const body = metricsResponse.text;
  assert.match(body, /onebox_plan_requests_total 1/);
  assert.match(body, /onebox_execute_requests_total 1/);
  assert.match(body, /onebox_execute_action_total\{action="post_job"\} 1/);
  assert.match(body, /onebox_status_requests_total 1/);
});

test('DefaultOneboxService produces calldata for wallet mode', async () => {
  const artifactsMock = mock.method(employer, 'prepareJobArtifacts', async () => ({
    jsonUri: 'ipfs://bafyjson',
    markdownUri: 'ipfs://bafymarkdown',
    specHash: '0x' + '1'.repeat(64),
  }));

  const provider = {
    async getNetwork() {
      return { chainId: 11155111n };
    },
  } as unknown as ethers.AbstractProvider;

  const plannerStub = { plan: async () => ({}) } as unknown as any;

  const service = new DefaultOneboxService({
    planner: plannerStub,
    provider,
    registryAddress: '0x000000000000000000000000000000000000dEaD',
  });

  try {
    const response = await service.execute(
      {
        action: 'post_job',
        payload: { title: 'Wallet job', reward: '1', deadlineDays: 3 },
        constraints: {},
        userContext: {},
      },
      'wallet'
    );

    assert.equal(response.ok, true);
    assert.equal(response.to, '0x000000000000000000000000000000000000dEaD');
    assert.equal(response.value, '0x0');
    assert.equal(response.chainId, 11155111);
    assert.ok(response.data && response.data.startsWith('0x'));
  } finally {
    artifactsMock.mock.restore();
  }
});

test('finalizeJob invokes registry finalize function', async () => {
  const finalizeCall = mock.fn(async () => ({ wait: async () => undefined }));
  const contractMock = mock.method(
    ethers as unknown as { Contract: new (...args: any[]) => unknown },
    'Contract',
    function () {
      return { finalize: finalizeCall };
    } as unknown as new (...args: any[]) => unknown
  );

  const loadStateMock = mock.method(execution, 'loadState', () => ({}));
  const saveStateMock = mock.method(execution, 'saveState', () => undefined);

  const wallet = {
    provider: {},
    connect() {
      return this as unknown as Wallet;
    },
  } as unknown as Wallet;

  try {
    await finalizeJob('42', wallet);
    assert.equal(finalizeCall.mock.calls.length, 1);
    assert.deepEqual(finalizeCall.mock.calls[0].arguments, ['42']);
  } finally {
    contractMock.mock.restore();
    loadStateMock.mock.restore();
    saveStateMock.mock.restore();
  }
});
