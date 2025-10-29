import { describe, expect, it } from 'vitest';
import { CommitRevealRound } from '../src/validators/commit-reveal.js';

const config = {
  revealDeadlineBlocks: 5,
  quorum: 2,
  slashPenaltyReason: 'Penalty',
};

describe('CommitRevealRound', () => {
  it('accepts valid commits and reveals', () => {
    const round = new CommitRevealRound(config, 100, 'round-1');
    const payload = { roundId: 'round-1', jobId: 'job-1', vote: true };
    const salt = 'salt-1';
    round.commit('0x01', payload, salt);
    round.reveal('0x01', { ...payload, salt }, salt, 102);
    round.closeRound();
    const result = round.computeResult();
    expect(result.quorumReached).toBe(false);
    expect(result.yesVotes).toBe(1);
  });

  it('slashes non-revealers and false voters', () => {
    const round = new CommitRevealRound(config, 200, 'round-2');
    const salt1 = 'salt-2-1';
    const salt2 = 'salt-2-2';
    round.commit('0x01', { roundId: 'round-2', jobId: 'job-1', vote: true }, salt1);
    round.commit('0x02', { roundId: 'round-2', jobId: 'job-1', vote: false }, salt2);
    round.reveal('0x01', { roundId: 'round-2', jobId: 'job-1', vote: true, salt: salt1 }, salt1, 201);
    round.closeRound();
    const result = round.computeResult();
    expect(result.slashCandidates).toContain('0x02');
    expect(result.slashCandidates).not.toContain('0x01');
  });

  it('rejects late reveals', () => {
    const round = new CommitRevealRound(config, 300, 'round-3');
    const payload = { roundId: 'round-3', jobId: 'job-1', vote: true };
    const salt = 'salt-3';
    round.commit('0x01', payload, salt);
    expect(() =>
      round.reveal('0x01', { ...payload, salt }, salt, 400)
    ).toThrowError('Reveal window closed');
  });
});
