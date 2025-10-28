import { ValidatorConstellationDemo } from '../src/core/constellation';
import { subgraphIndexer } from '../src/core/subgraph';
import { selectCommittee } from '../src/core/vrf';
import { AgentAction, Hex, VoteValue } from '../src/core/types';
import { demoLeaves, demoSetup, demoJobBatch, budgetOverrunAction } from '../src/core/fixtures';
import { writeReportArtifacts, ReportContext } from '../src/core/reporting';
import path from 'path';

function main() {
  subgraphIndexer.clear();
  const leaves = demoLeaves();
  const setup = demoSetup(leaves);
  const demo = new ValidatorConstellationDemo(setup);

  const originalEntropy = demo.getEntropySources();

  const validatorAddresses = leaves.slice(0, 5);
  validatorAddresses.forEach((leaf) => demo.registerValidator(leaf.ensName, leaf.owner, 10_000_000_000_000_000_000n));

  const agentLeaf = leaves.find((leaf) => leaf.ensName === 'nova.agent.agi.eth');
  if (!agentLeaf) {
    throw new Error('agent leaf missing');
  }
  demo.registerAgent(agentLeaf.ensName, agentLeaf.owner, 'deep-space-lab', 1_000_000n);

  const rotatedVerifyingKey: Hex = '0xf1f2f3f4f5f6f7f8f9fafbfcfdfeff00112233445566778899aabbccddeeff0011' as Hex;
  demo.updateZkVerifyingKey(rotatedVerifyingKey);
  const entropyRotation = demo.updateEntropySources({
    onChainEntropy: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as Hex,
    recentBeacon: '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210' as Hex,
  });
  console.log('Entropy rotation applied.', { before: originalEntropy, after: entropyRotation });
  console.log('ZK verifying key rotated.', { verifyingKey: rotatedVerifyingKey });

  const nodeLeaves = leaves.filter((leaf) => leaf.ensName.includes('.node.agi.eth'));
  const registeredNodes = nodeLeaves.map((leaf) => demo.registerNode(leaf.ensName, leaf.owner));

  const maintenancePause = demo.pauseDomain('lunar-foundry', 'Scheduled maintenance window');
  const maintenanceResume = demo.resumeDomain('lunar-foundry', 'governance:maintenance-complete');
  const updatedSafety = demo.updateDomainSafety('deep-space-lab', {
    unsafeOpcodes: new Set(['SELFDESTRUCT', 'DELEGATECALL', 'STATICCALL']),
    allowedTargets: [
      '0xa11ce5c1e11ce000000000000000000000000000',
      '0xbeac0babe00000000000000000000000000000000',
    ],
    maxCalldataBytes: 6144,
  });
  demo.updateSentinelConfig({ budgetGraceRatio: 0.07 });
  const agentIdentity = demo.setAgentBudget(agentLeaf.ensName, 1_200_000n);

  const round = 1;
  const domainId = 'deep-space-lab';
  const currentEntropy = demo.getEntropySources();
  const committeeSelection = selectCommittee(
    demo.listValidators(),
    domainId,
    round,
    demo.getGovernance(),
    currentEntropy.onChainEntropy,
    currentEntropy.recentBeacon,
  );
  console.log('VRF witness derived for committee selection.', {
    transcript: committeeSelection.witness.transcript,
    keccakSeed: committeeSelection.witness.keccakSeed,
    shaSeed: committeeSelection.witness.shaSeed,
  });
  const dishonestValidator = committeeSelection.committee[0];
  const absenteeValidator = committeeSelection.committee[1];
  const voteOverrides: Record<string, VoteValue> = dishonestValidator
    ? {
        [dishonestValidator.address]: 'REJECT',
      }
    : {};
  const nonRevealValidators = absenteeValidator ? [absenteeValidator.address] : [];

  const jobBatch = demoJobBatch(domainId, 1000);

  const anomalies: AgentAction[] = [
    {
      agent: agentIdentity,
      domainId: 'deep-space-lab',
      type: 'CALL',
      amountSpent: 12_500n,
      opcode: 'STATICCALL',
      description: 'Unsafe opcode invoked during maintenance bypass',
      calldataBytes: 8_192,
      metadata: { calldataBytes: 8_192 },
    },
    {
      ...budgetOverrunAction(
        agentLeaf.ensName,
        agentLeaf.owner as `0x${string}`,
        'deep-space-lab',
        1_800_000n,
        agentIdentity.budget,
      ),
      description: 'Overspend attempt detected by sentinel',
      metadata: { invoice: 'INV-7788' },
    },
    {
      agent: agentIdentity,
      domainId: 'deep-space-lab',
      type: 'CALL',
      amountSpent: 1_000n,
      target: '0xd15a11ee00000000000000000000000000000000',
      description: 'Call routed to unauthorized contract',
    },
    {
      agent: agentIdentity,
      domainId: 'deep-space-lab',
      type: 'CALL',
      amountSpent: 500n,
      target: '0xa11ce5c1e11ce000000000000000000000000000',
      calldataBytes: 16_384,
      description: 'Oversized calldata surge',
      metadata: { calldataBytes: 16_384 },
    },
  ];

  const roundResult = demo.runValidationRound({
    round,
    truthfulVote: 'APPROVE',
    jobBatch,
    committeeSignature: '0x777788889999aaaabbbbccccddddeeeeffff0000111122223333444455556666',
    voteOverrides,
    nonRevealValidators,
    anomalies,
  });

  const reportDir = path.join(__dirname, '..', 'reports', 'latest');
  const domainState = demo.getDomainState('deep-space-lab');
  const jobSample = demoJobBatch('deep-space-lab', 5);
  const reportContext: ReportContext = {
    verifyingKey: demo.getZkVerifyingKey(),
    entropyBefore: originalEntropy,
    entropyAfter: entropyRotation,
    governance: demo.getGovernance(),
    sentinelGraceRatio: demo.getSentinelBudgetGraceRatio(),
    nodesRegistered: registeredNodes,
    primaryDomain: domainState,
    updatedSafety,
    maintenance: { pause: maintenancePause, resume: maintenanceResume },
    scenarioName: 'Validator Constellation Guardian Deck',
    ownerNotes: {
      script: 'runDemo.ts baseline scenario',
      agentBudget: agentIdentity.budget.toString(),
    },
    jobSample,
  };

  writeReportArtifacts({
    reportDir,
    roundResult,
    subgraphRecords: subgraphIndexer.list(),
    events: [committeeSelection.witness, ...roundResult.commits, ...roundResult.reveals],
    context: reportContext,
  });

  console.log('Validator Constellation demo executed successfully.');
  console.log('Entropy witness transcript verified:', roundResult.vrfWitness.transcript);
  console.log(`Nodes registered: ${registeredNodes.map((node) => node.ensName).join(', ')}`);
  console.log(`Reports written to ${reportDir}`);
}

main();
