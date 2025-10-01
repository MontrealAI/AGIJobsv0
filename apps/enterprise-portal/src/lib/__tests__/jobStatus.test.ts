import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { jobStateToPhase, phaseToTagColor } from '../jobStatus.js';

describe('jobStateToPhase', () => {
  it('maps submitted state to Submitted phase', () => {
    assert.equal(jobStateToPhase(3), 'Submitted');
  });

  it('maps completed state to Validated phase', () => {
    assert.equal(jobStateToPhase(4), 'Validated');
  });
});

describe('phaseToTagColor', () => {
  it('returns green for validated jobs', () => {
    assert.equal(phaseToTagColor('Validated'), 'green');
  });
});
