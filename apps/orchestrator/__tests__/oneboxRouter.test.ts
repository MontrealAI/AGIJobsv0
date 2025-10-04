import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test, { mock } from 'node:test';
import { ethers } from 'ethers';
import type { Wallet } from 'ethers';
import express from 'express';
import request from 'supertest';
import type { IntentEnvelope } from '../../../packages/onebox-orchestrator/src/ics/types';
import {
  createOneboxRouter,
  plannerIntentToJobIntent,
  formatDeadline,
  mapJobStateToStatus,
  DefaultOneboxService,
  type OneboxPlanResponse,
  type OneboxExecuteResponse,
  type StatusResponse,
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
  assert.equal(intent.kind, 'post_job');
  assert.equal(intent.title, 'Label 500 images');
  assert.equal(intent.deadline_days, 7);
  assert.ok(Array.isArray(intent.attachments));
  assert.equal(intent.attachments?.[0]?.cid, 'bafyExample');
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

const TEST_TOKEN = 'test-token';

function makePlanResponse(overrides: Partial<OneboxPlanResponse> = {}): OneboxPlanResponse {
  const base: OneboxPlanResponse = {
    summary: 'Summary',
    preview_summary: 'Summary',
    intent: {
      kind: 'post_job',
      title: 'Example',
      description: 'Example description',
      reward_agialpha: '1',
      deadline_days: 7,
      attachments: [],
      constraints: {},
    },
    plan: {
      plan_id: 'plan-123',
      steps: [],
      budget: { token: 'AGIALPHA', max: '0' },
      policies: { allowTools: [], denyTools: [], requireValidator: true },
    },
    missing_fields: [],
    warnings: [],
    requiresConfirmation: true,
    planHash: '0xplan',
  };
  return { ...base, ...overrides };
}

function withRouter<T>(
  service: Parameters<typeof createOneboxRouter>[0],
  callback: (router: express.Router) => Promise<T> | T
): Promise<T> | T {
  const previousOnebox = process.env.ONEBOX_API_TOKEN;
  const previousApiToken = process.env.API_TOKEN;
  process.env.ONEBOX_API_TOKEN = TEST_TOKEN;
  delete process.env.API_TOKEN;
  try {
    const router = createOneboxRouter(service);
    return callback(router);
  } finally {
    if (previousOnebox === undefined) {
      delete process.env.ONEBOX_API_TOKEN;
    } else {
      process.env.ONEBOX_API_TOKEN = previousOnebox;
    }
    if (previousApiToken === undefined) {
      delete process.env.API_TOKEN;
    } else {
      process.env.API_TOKEN = previousApiToken;
    }
  }
}

function authorised<T extends { set(field: string, value: string): T }>(requestBuilder: T): T {
  return requestBuilder.set('Authorization', `Bearer ${TEST_TOKEN}`);
}

test('onebox router plan route delegates to service', async () => {
  const planResponse = makePlanResponse();

  await withRouter(
    {
      async plan() {
        return planResponse;
      },
      async execute() {
        return { ok: true } as OneboxExecuteResponse;
      },
      async status(): Promise<StatusResponse> {
        return { jobs: [] };
      },
    },
    async (router) => {
      const app = express();
      app.use(express.json());
      app.use('/onebox', router);

      const response = await authorised(request(app).post('/onebox/plan')).send({ text: 'Create a job' });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.summary, planResponse.summary);
    }
  );
});

test('plan route responds with 401 when token missing', async () => {
  const previousOnebox = process.env.ONEBOX_API_TOKEN;
  const previousApiToken = process.env.API_TOKEN;
  delete process.env.ONEBOX_API_TOKEN;
  delete process.env.API_TOKEN;
  try {
    const router = createOneboxRouter({
      async plan() {
        return makePlanResponse();
      },
      async execute() {
        return { ok: true } as OneboxExecuteResponse;
      },
      async status(): Promise<StatusResponse> {
        return { jobs: [] };
      },
    });

    const app = express();
    app.use(express.json());
    app.use('/onebox', router);

    const response = await request(app).post('/onebox/plan').send({ text: 'Create a job' });
    assert.equal(response.status, 401);
    assert.match(response.body.error, /not configured/i);
  } finally {
    if (previousOnebox === undefined) {
      delete process.env.ONEBOX_API_TOKEN;
    } else {
      process.env.ONEBOX_API_TOKEN = previousOnebox;
    }
    if (previousApiToken === undefined) {
      delete process.env.API_TOKEN;
    } else {
      process.env.API_TOKEN = previousApiToken;
    }
  }
});

test('plan route responds with 403 for invalid token', async () => {
  await withRouter(
    {
      async plan() {
        return makePlanResponse();
      },
      async execute() {
        return { ok: true } as OneboxExecuteResponse;
      },
      async status(): Promise<StatusResponse> {
        return { jobs: [] };
      },
    },
    async (router) => {
      const app = express();
      app.use(express.json());
      app.use('/onebox', router);

      const response = await request(app)
        .post('/onebox/plan')
        .set('Authorization', 'Bearer wrong-token')
        .send({ text: 'Create a job' });
      assert.equal(response.status, 403);
    }
  );
});

test('plan route accepts valid HMAC authorization', async () => {
  await withRouter(
    {
      async plan() {
        return makePlanResponse();
      },
      async execute() {
        return { ok: true } as OneboxExecuteResponse;
      },
      async status(): Promise<StatusResponse> {
        return { jobs: [] };
      },
    },
    async (router) => {
      const app = express();
      app.use(express.json());
      app.use('/onebox', router);

      const timestamp = Math.floor(Date.now() / 1000);
      const canonical = `POST /onebox/plan ${timestamp}`;
      const signature = createHmac('sha256', TEST_TOKEN).update(canonical).digest('hex');
      const response = await request(app)
        .post('/onebox/plan')
        .set('Authorization', `HMAC ${timestamp}:${signature}`)
        .send({ text: 'Create a job' });

      assert.equal(response.status, 200);
    }
  );
});

test('metrics endpoint exposes Prometheus counters', async () => {
  resetMetrics();

  await withRouter(
    {
      async plan() {
        return makePlanResponse();
      },
      async execute() {
        return { ok: true } as OneboxExecuteResponse;
      },
      async status(): Promise<StatusResponse> {
        return { jobs: [] };
      },
    },
    async (router) => {
      const app = express();
      app.use(express.json());
      app.use('/onebox', router);

      await authorised(request(app).post('/onebox/plan')).send({ text: 'Create a job' });
      await authorised(request(app).post('/onebox/execute')).send({
        intent: {
          kind: 'post_job',
          title: 'Example',
          description: 'Example description',
          reward_agialpha: '1',
          deadline_days: 7,
          attachments: [],
          constraints: {},
        },
        mode: 'relayer',
        planHash: '0xplan',
      });
      await authorised(request(app).get('/onebox/status'));

      const metricsResponse = await authorised(request(app).get('/onebox/metrics'));
      assert.equal(metricsResponse.status, 200);
      assert.equal(metricsResponse.headers['content-type'], 'text/plain; charset=utf-8; version=0.0.4');
      const body = metricsResponse.text;
      assert.match(body, /plan_total\{intent_type="post_job",http_status="200"\} 1/);
      assert.match(body, /execute_total\{intent_type="post_job",http_status="200"\} 1/);
      assert.match(body, /status_total\{intent_type="status",http_status="200"\} 1/);
      assert.match(body, /time_to_outcome_seconds_bucket\{endpoint="plan",le="\+Inf"\} 1/);
    }
  );
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
        kind: 'post_job',
        title: 'Wallet job',
        description: 'Wallet execution test',
        reward_agialpha: '1',
        deadline_days: 3,
        attachments: [],
        constraints: {},
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
  const finalizeCall = mock.fn(async () => ({ hash: '0xabc', wait: async () => undefined }));
  const ethersModule = require('ethers') as { ethers: { Contract: new (...args: any[]) => unknown } };
  const originalDescriptor = Object.getOwnPropertyDescriptor(ethersModule.ethers, 'Contract');
  Object.defineProperty(ethersModule.ethers, 'Contract', {
    configurable: true,
    value: function () {
      return { finalize: finalizeCall };
    } as unknown as new (...args: any[]) => unknown,
  });

  const loadStateMock = mock.method(execution, 'loadState', () => ({}));
  const saveStateMock = mock.method(execution, 'saveState', () => undefined);

  const wallet = {
    provider: {},
    connect() {
      return this as unknown as Wallet;
    },
  } as unknown as Wallet;

  try {
    const result = await finalizeJob('42', wallet);
    assert.equal(finalizeCall.mock.calls.length, 1);
    assert.deepEqual(finalizeCall.mock.calls[0].arguments, ['42']);
    assert.equal(result.txHash, '0xabc');
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(ethersModule.ethers, 'Contract', originalDescriptor);
    }
    loadStateMock.mock.restore();
    saveStateMock.mock.restore();
  }
});
