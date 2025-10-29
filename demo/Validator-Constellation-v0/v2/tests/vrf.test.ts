import { describe, expect, it } from 'vitest';
import { VrfCommitteeSelector } from '../src/validators/vrf-committee.js';

const selector = new VrfCommitteeSelector({ committeeSize: 2, entropyMix: 'entropy' });

const validators = Array.from({ length: 5 }).map((_, index) => ({
  address: `0x0${index}` as `0x${string}`,
  ensName: `validator-${index}.club.agi.eth`,
  stake: BigInt(index + 1),
  active: true,
  slashed: false,
  reputation: 100,
}));

describe('VrfCommitteeSelector', () => {
  it('selects deterministic committees per round', () => {
    const round1 = selector.selectCommittee(validators, 'round-1');
    const round1b = selector.selectCommittee(validators, 'round-1');
    expect(round1).toEqual(round1b);
  });

  it('never exceeds committee size', () => {
    const committee = selector.selectCommittee(validators.slice(0, 1), 'round-2');
    expect(committee.length).toBe(1);
  });
});
