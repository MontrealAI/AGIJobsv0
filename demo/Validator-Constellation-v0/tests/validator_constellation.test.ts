import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidatorConstellation } from '../src/validatorConstellation';
import { commitmentFor } from '../src/validatorConstellation';
import { CommitRevealWindowConfig } from '../src/types';

const config: CommitRevealWindowConfig = {
  commitWindowSeconds: 60,
  revealWindowSeconds: 60,
  vrfSeed: 'galactic',
  validatorsPerJob: 3,
  revealQuorum: 2,
  nonRevealPenaltyBps: 500,
  incorrectVotePenaltyBps: 1000,
};

const owner = '0xabc';

const validators = [
  {
    address: '0x100',
    ensName: 'orion.club.agi.eth',
    domain: 'core',
    stake: 1000n,
  },
  {
    address: '0x101',
    ensName: 'vega.club.agi.eth',
    domain: 'core',
    stake: 1200n,
  },
  {
    address: '0x102',
    ensName: 'rigel.club.agi.eth',
    domain: 'core',
    stake: 1500n,
  },
  {
    address: '0x103',
    ensName: 'sirius.alpha.club.agi.eth',
    domain: 'core',
    stake: 1500n,
  },
];

const agents = [
  {
    address: '0x200',
    ensName: 'zephyr.agent.agi.eth',
    domain: 'core',
    budget: 1000n,
  },
];

test('validator registration enforces ENS namespaces', () => {
  const constellation = new ValidatorConstellation(config, owner);
  const report = constellation.registerValidator(
    {
      ...validators[0],
      registeredAt: Date.now(),
      active: true,
    },
    {
      ensName: validators[0].ensName,
      owner,
      signature: '0xdead',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 100000,
    },
  );
  assert.equal(report.approved, true);
  assert.equal(report.namespace, 'club');
  assert.equal(constellation.getValidators().length, 1);
});

test('validator committee commit reveal flow and finalization', () => {
  const constellation = new ValidatorConstellation(config, owner);
  validators.slice(0, 3).forEach((validator) => {
    constellation.registerValidator(
      {
        ...validator,
        registeredAt: Date.now(),
        active: true,
      },
      {
        ensName: validator.ensName,
        owner,
        signature: '0xdead',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 100000,
      },
    );
  });
  constellation.registerAgent(
    agents[0],
    {
      ensName: agents[0].ensName,
      owner,
      signature: '0xbeef',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 100000,
    },
  );
  const round = constellation.requestValidation('job-1', 'core', '0xabc');
  assert.equal(round.committee.length, config.validatorsPerJob);
  round.committee.forEach((validator) => {
    const vote = { outcome: 'approved' as const, salt: '0x1' };
    const commitment = commitmentFor('job-1', vote, validator);
    constellation.commitVote('job-1', validator, commitment);
  });
  round.committee.forEach((validator) => {
    const vote = { outcome: 'approved' as const, salt: '0x1' };
    constellation.revealVote('job-1', validator, vote);
  });
  const job = constellation.getJobs().find((j) => j.jobId === 'job-1');
  assert.ok(job?.finalized);
  assert.equal(job?.reveals.size, config.validatorsPerJob);
});

test('sentinel alert pauses domain and prevents new jobs', () => {
  const constellation = new ValidatorConstellation(config, owner);
  validators.slice(0, 3).forEach((validator) => {
    constellation.registerValidator(
      {
        ...validator,
        registeredAt: Date.now(),
        active: true,
      },
      {
        ensName: validator.ensName,
        owner,
        signature: '0xdead',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 100000,
      },
    );
  });
  constellation.raiseSentinelAlert(
    {
      domain: 'core',
      reason: 'overspend',
      severity: 'critical',
    },
    owner,
  );
  assert.throws(() => constellation.requestValidation('job-2', 'core', '0x123'), /Domain core is paused/);
});

test('non reveal penalties slash stake', () => {
  const shortConfig: CommitRevealWindowConfig = {
    ...config,
    commitWindowSeconds: -1,
    revealWindowSeconds: -1,
  };
  const constellation = new ValidatorConstellation(shortConfig, owner);
  constellation.registerValidator(
    {
      ...validators[0],
      registeredAt: Date.now(),
      active: true,
    },
    {
      ensName: validators[0].ensName,
      owner,
      signature: '0xdead',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 100000,
    },
  );
  constellation.registerValidator(
    {
      ...validators[1],
      registeredAt: Date.now(),
      active: true,
    },
    {
      ensName: validators[1].ensName,
      owner,
      signature: '0xdead',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 100000,
    },
  );
  constellation.registerValidator(
    {
      ...validators[2],
      registeredAt: Date.now(),
      active: true,
    },
    {
      ensName: validators[2].ensName,
      owner,
      signature: '0xdead',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 100000,
    },
  );
  constellation.requestValidation('job-3', 'core', '0xabc');
  constellation.enforceRevealPenalties();
  const slashes = constellation.getSlashes();
  assert.ok(slashes.length > 0);
});

test('owner can tune commit-reveal parameters and rotate VRF key', () => {
  const constellation = new ValidatorConstellation(config, owner);
  const updated = constellation.updateCommitRevealConfig({ revealQuorum: 3 }, owner);
  assert.equal(updated.revealQuorum, 3);
  const newPublicKey = constellation.rotateVRFSecret('0x1234', owner);
  assert.ok(newPublicKey.startsWith('0x'));
});

test('demo scenario batches zk proof', () => {
  const constellation = new ValidatorConstellation(config, owner);
  const result = constellation.runDemoScenario({
    validators,
    agents,
    jobs: [
      { jobId: 'job-11', domain: 'core', outcome: 'approved' },
      { jobId: 'job-12', domain: 'core', outcome: 'approved' },
      { jobId: 'job-13', domain: 'core', outcome: 'approved' },
    ],
    anomalies: [
      {
        agent: agents[0],
        attemptedSpend: 2000n,
        maxBudget: 1000n,
        timestamp: Date.now(),
      },
    ],
    committeeConfig: config,
  });
  assert.equal(result.batchProofs.length, 1);
  assert.ok(result.batchProofs[0].accepted);
  assert.ok(result.pausedDomains.some((pause) => pause.domain === 'core'));
});
