import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import type { IntentEnvelope } from '../../../packages/onebox-orchestrator/src/ics/types';
import type { PlanResponse, StatusResponse } from '../../../packages/onebox-sdk/src';
import {
  createOneboxRouter,
  plannerIntentToJobIntent,
  formatDeadline,
  mapJobStateToStatus,
} from '../oneboxRouter';

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
