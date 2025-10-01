import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveStatusBanner } from '../JobLifecycleDashboard.helpers.js';
import type { JobSummary } from '../../types/index.js';

const ZERO_HASH = `0x${'0'.repeat(64)}`;
const BASE_JOB: JobSummary = {
  jobId: 1n,
  employer: '0x0000000000000000000000000000000000000000',
  reward: 0n,
  stake: 0n,
  fee: 0n,
  status: 0,
  phase: 'Submitted',
  lastUpdated: 2_000,
  deadline: 3_600,
  specHash: ZERO_HASH,
};

describe('deriveStatusBanner', () => {
  it('highlights submission awaiting validation', () => {
    const banner = deriveStatusBanner({
      job: {
        ...BASE_JOB,
        phase: 'Submitted',
        agent: '0x1234567890abcdef1234567890abcdef12345678',
        resultSubmittedAt: 1_900,
      },
      now: 2_000,
    });

    assert.ok(banner, 'banner should be returned');
    assert.equal(banner.variant, 'alert');
    assert.match(banner.message, /Deliverable submitted/);
    assert.match(banner.message, /Awaiting validator review/);
  });

  it('shows validation progress while committee is active', () => {
    const banner = deriveStatusBanner({
      job: {
        ...BASE_JOB,
        phase: 'InValidation',
        totalValidators: 3,
        validatorVotes: 1,
        validationStartedAt: 1_950,
      },
      now: 2_000,
      validationCountdown: 'in 1 hour',
    });

    assert.ok(banner, 'banner should be returned');
    assert.equal(banner.variant, 'alert');
    assert.match(banner.message, /In validation/);
    assert.match(banner.message, /1 of 3 votes/);
    assert.match(banner.message, /Decision window closes in 1 hour/);
  });

  it('confirms validation completion with outcome messaging', () => {
    const banner = deriveStatusBanner({
      job: {
        ...BASE_JOB,
        phase: 'Validated',
        success: true,
        validationStartedAt: 1_950,
        lastUpdated: 2_050,
      },
      now: 2_100,
    });

    assert.ok(banner, 'banner should be returned');
    assert.equal(banner.variant, 'alert success');
    assert.match(banner.message, /Validation completed/);
    assert.ok(!banner.message.includes('In validation'));
  });

  it('tracks finalised jobs separately from validation', () => {
    const banner = deriveStatusBanner({
      job: {
        ...BASE_JOB,
        phase: 'Finalized',
        lastUpdated: 2_500,
      },
      now: 2_600,
    });

    assert.ok(banner, 'banner should be returned');
    assert.equal(banner.variant, 'alert success');
    assert.match(banner.message, /Job finalized/);
  });
});
