import assert from 'assert';
import { parseIntentConstraint } from '../src/ics/parser';

const validCreateJob = {
  intent: 'create_job',
  params: {
    job: {
      title: 'Label images',
      description: 'Tag 500 images with cat vs dog',
      rewardAmount: '42.5',
      deadlineDays: 7,
    },
  },
  confirm: true,
  confirmationText: 'Post job paying 42.5 AGIALPHA with 7 day deadline',
  meta: {
    traceId: '123e4567-e89b-12d3-a456-426614174000',
  },
};

const missingFields = {
  intent: 'create_job',
  params: {
    job: {
      title: 'Hi',
      description: 'Too short',
      rewardAmount: '0',
      deadlineDays: 0,
    },
  },
};

function testValidCreateJob() {
  const result = parseIntentConstraint(validCreateJob);
  assert.strictEqual(
    result.ok,
    true,
    `Expected ok=true, received issues: ${result.issues}`
  );
  assert.ok(result.data, 'Envelope should be defined for valid payload');
  assert.strictEqual(result.data?.intent, 'create_job');
  if (result.data?.intent !== 'create_job') {
    throw new Error('Expected create_job intent');
  }
  const payload = result.data.payload;
  assert.strictEqual(payload.params.job.title, 'Label images');
  assert.strictEqual(payload.confirm, true);
}

function testInvalidJob() {
  const result = parseIntentConstraint(missingFields);
  assert.strictEqual(result.ok, false, 'Expected validation failure');
  assert.ok(
    result.issues && result.issues.length >= 2,
    'Should report multiple issues'
  );
}

function testConfirmationGuard() {
  const invalid = {
    ...validCreateJob,
    confirmationText: 'Needs confirm',
    confirm: false,
  };
  const result = parseIntentConstraint(invalid);
  assert.strictEqual(
    result.ok,
    false,
    'confirmationText requires confirm=true'
  );
  assert.ok(result.issues?.some((issue) => issue.includes('confirmationText')));
}

testValidCreateJob();
testInvalidJob();
testConfirmationGuard();

console.log('ICS schema tests passed');
