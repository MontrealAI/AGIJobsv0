import { strict as assert } from 'node:assert';
import process from 'node:process';
import {
  DEFAULT_ACTORS,
  DEFAULT_JOB_BLUEPRINT,
  DEFAULT_MILESTONES,
  GovernanceScenarioContext,
  buildMilestonePrompt,
  normalizeWalletAddress,
} from '../src/lib/governanceScenario.ts';

function testNormalizeWallet(): void {
  assert.equal(
    normalizeWalletAddress(' 0x52908400098527886E0F7030069857D2E4169EE7 '),
    '0x52908400098527886E0F7030069857D2E4169EE7'
  );
  assert.equal(normalizeWalletAddress('0x1234'), null);
  assert.equal(normalizeWalletAddress(''), null);
}

function buildContext(): GovernanceScenarioContext {
  const sponsor = { ...DEFAULT_ACTORS.find((actor) => actor.role === 'nation')! };
  sponsor.wallet = '0x1111111111111111111111111111111111111111';
  const owner = { ...DEFAULT_ACTORS.find((actor) => actor.role === 'owner')! };
  owner.wallet = '0x4444444444444444444444444444444444444444';
  const validators = DEFAULT_ACTORS.filter((actor) => actor.role === 'validator')
    .slice(0, 2)
    .map((actor, index) => ({
      ...actor,
      wallet:
        index === 0
          ? '0x2222222222222222222222222222222222222222'
          : '0x3333333333333333333333333333333333333333',
    }));
  const job = {
    ...DEFAULT_JOB_BLUEPRINT,
    title: 'Quantum Accord',
    policyFocus: 'Establish unstoppable cross-border kill-switch guardrails.',
    rewardAgialpha: '420000',
    validatorStakeAgialpha: '210000',
    quorumPercent: 75,
    commitWindowHours: 4,
    revealWindowHours: 4,
    disputeWindowHours: 8,
    referenceUri: 'ipfs://examplecid',
  };
  return {
    network: 'sepolia',
    sponsor,
    validators,
    owner,
    job,
    connectedActorIds: new Set(validators.map((actor) => actor.id)),
  };
}

function testProposalPrompt(context: GovernanceScenarioContext): void {
  const proposalMilestone = DEFAULT_MILESTONES[0];
  const prompt = buildMilestonePrompt(proposalMilestone, context);
  assert.ok(prompt.includes('Quantum Accord'));
  assert.ok(prompt.includes('Sepolia testnet'));
  assert.ok(prompt.includes(context.sponsor.name));
  assert.ok(prompt.includes(context.owner.name));
  assert.ok(prompt.includes(context.validators[0]!.name));
  assert.ok(prompt.includes('420000 AGIALPHA'));
}

function testOperationalPrompts(context: GovernanceScenarioContext): void {
  const commitMilestone = DEFAULT_MILESTONES.find(
    (milestone) => milestone.id === 'validator-commit'
  );
  assert.ok(commitMilestone);
  const commitPrompt = buildMilestonePrompt(commitMilestone!, context);
  assert.ok(
    commitPrompt.includes('validator:cli commit'),
    'commit prompt must reference validator CLI'
  );
  const ownerMilestone = DEFAULT_MILESTONES.find(
    (milestone) => milestone.id === 'owner-oversight'
  );
  assert.ok(ownerMilestone);
  const ownerPrompt = buildMilestonePrompt(ownerMilestone!, context);
  assert.ok(
    ownerPrompt.includes('owner:command-center'),
    'owner prompt must mention command deck'
  );
}

try {
  testNormalizeWallet();
  const context = buildContext();
  testProposalPrompt(context);
  testOperationalPrompts(context);
  console.log('✅ governance scenario prompts verified');
} catch (error) {
  console.error('❌ governance scenario test failed');
  console.error(error);
  process.exitCode = 1;
}
