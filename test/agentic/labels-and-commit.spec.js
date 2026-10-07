const { expect } = require('chai');

const {
  ensLabelFrom,
  shouldApply,
} = require('../../examples/agentic/v2-agent-gateway');
const {
  commitHash,
  parseProof,
} = require('../../examples/agentic/v2-validator');

describe('agentic helpers', () => {
  it('ensLabelFrom normalises ENS labels', () => {
    expect(ensLabelFrom('alice.agent.agi.eth')).to.equal('alice');
    expect(ensLabelFrom('Validator.club.agi.eth')).to.equal('validator');
    expect(ensLabelFrom('member.alpha.club.agi.eth')).to.equal('member');
  });

  it('shouldApply enforces reward and stake thresholds', () => {
    const policy = {
      minRewardWei: '1000',
      maxStakeWei: '5000',
      skipCategories: ['spam'],
    };
    expect(
      shouldApply(
        { reward: 2000n, requiredStake: 3000n, category: 'general' },
        policy
      )
    ).to.equal(true);
    expect(
      shouldApply(
        { reward: 500n, requiredStake: 3000n, category: 'general' },
        policy
      )
    ).to.equal(false);
    expect(
      shouldApply(
        { reward: 2000n, requiredStake: 6000n, category: 'general' },
        policy
      )
    ).to.equal(false);
    expect(
      shouldApply(
        { reward: 2000n, requiredStake: 3000n, category: 'spam' },
        policy
      )
    ).to.equal(false);
  });

  it('commitHash is deterministic for identical salt and decision', () => {
    const salt = '0x' + '11'.repeat(32);
    const fields = {
      jobId: 1n,
      nonce: 2n,
      chainId: 31337n,
      validator: '0x' + '12'.repeat(20),
      specHash: '0x' + '13'.repeat(32),
      burnTxHash: '0x' + '00'.repeat(32),
      domainSeparator: '0x' + '14'.repeat(32),
      approve: true,
      salt,
    };
    const h1 = commitHash(fields);
    const h2 = commitHash(fields);
    const h3 = commitHash({ ...fields, approve: false });
    expect(h1).to.equal(h2);
    expect(h1).to.match(/^0x[0-9a-f]{64}$/);
    expect(h3).to.not.equal(h1);
  });

  it('parseProof normalises mixed inputs', () => {
    const proof = parseProof('["0x1", "0x2"]');
    expect(proof).to.have.lengthOf(2);
    proof.forEach((entry) => {
      expect(entry).to.match(/^0x[0-9a-f]{64}$/);
    });
  });
});
