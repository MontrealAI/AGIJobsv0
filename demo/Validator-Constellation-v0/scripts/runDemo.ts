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

  const registryRotation = demo.rotateEnsRegistry({
    leaves: [
      { ensName: 'vega.club.agi.eth', owner: '0x8888000000000000000000000000000000008888' as Hex },
      { ensName: 'aurora.alpha.node.agi.eth', owner: '0xaaaabbbbccccddddeeeeffff0000111122223333' as Hex },
    ],
  });
  console.log('ENS registry rotated.', registryRotation);

  const vegaValidator = demo.registerValidator(
    'vega.club.agi.eth',
    '0x8888000000000000000000000000000000008888' as Hex,
    12_000_000_000_000_000_000n,
  );

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
  const auroraNode = demo.registerNode('aurora.alpha.node.agi.eth', '0xaaaabbbbccccddddeeeeffff0000111122223333' as Hex);
  registeredNodes.push(auroraNode);

  const maintenancePause = demo.pauseDomain('lunar-foundry', 'Scheduled maintenance window');
  const maintenanceResume = demo.resumeDomain('lunar-foundry', 'governance:maintenance-complete');
  const updatedSafety = demo.updateDomainSafety('deep-space-lab', {
    unsafeOpcodes: new Set(['SELFDESTRUCT', 'DELEGATECALL', 'STATICCALL']),
    allowedTargets: [
      '0xa11ce5c1e11ce000000000000000000000000000',
      '0xbeac0babe00000000000000000000000000000000',
    ],
    maxCalldataBytes: 6144,
    forbiddenSelectors: ['0xa9059cbb', '0x23b872dd'],
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
      amountSpent: 750n,
      target: '0xa11ce5c1e11ce000000000000000000000000000',
      functionSelector: '0xa9059cbb',
      description: 'Forbidden token transfer selector invoked',
      metadata: { functionSelector: '0xa9059cbb' },
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

  const treasuryDistributions = [] as ReturnType<typeof demo.distributeTreasury>[];
  if (roundResult.treasuryBalanceAfter > 0n) {
    const firstAmount = roundResult.treasuryBalanceAfter / 2n > 0n ? roundResult.treasuryBalanceAfter / 2n : roundResult.treasuryBalanceAfter;
    const firstDistribution = demo.distributeTreasury(
      '0x9999000000000000000000000000000000009999',
      firstAmount,
    );
    treasuryDistributions.push(firstDistribution);
    const remaining = demo.getTreasuryBalance();
    if (remaining > 0n) {
      const secondAmount = remaining / 2n > 0n ? remaining / 2n : remaining;
      const secondDistribution = demo.distributeTreasury(
        '0x8888000000000000000000000000000000008888',
        secondAmount,
      );
      treasuryDistributions.push(secondDistribution);
    }
  }

  const reportDir = path.join(__dirname, '..', 'reports', 'latest');
  const domainState = demo.getDomainState('deep-space-lab');
  const jobSample = demoJobBatch('deep-space-lab', 5);
  const ensLeaves = demo.listEnsLeaves();
  const ensPreview = ensLeaves.slice(0, Math.min(12, ensLeaves.length)).map((leaf) => leaf.ensName);
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
      treasuryDistributions: treasuryDistributions.map((event) => ({
        recipient: event.recipient,
        amount: event.amount.toString(),
      })),
      ensRegistry: registryRotation,
      newValidator: vegaValidator,
    },
    jobSample,
    treasury: {
      address: demo.getTreasuryAddress(),
      balance: demo.getTreasuryBalance(),
      distributions: treasuryDistributions,
    },
    ensMerkleRoot: demo.getEnsMerkleRoot(),
    ensRegistrySize: ensLeaves.length,
    ensRegistryPreview: ensPreview,
  };

  writeReportArtifacts({
    reportDir,
    roundResult,
    subgraphRecords: subgraphIndexer.list(),
    events: [
      registryRotation,
      vegaValidator,
      committeeSelection.witness,
      ...roundResult.commits,
      ...roundResult.reveals,
      ...treasuryDistributions,
    ],
    context: reportContext,
    jobBatch,
    truthfulVote: 'APPROVE',
  });

  console.log('Validator Constellation demo executed successfully.');
  console.log('Entropy witness transcript verified:', roundResult.vrfWitness.transcript);
  console.log(`Nodes registered: ${registeredNodes.map((node) => node.ensName).join(', ')}`);
  if (treasuryDistributions.length > 0) {
    console.log(
      `Treasury distributions executed: ${treasuryDistributions
        .map((event) => `${event.amount.toString()} wei to ${event.recipient}`)
        .join('; ')}`,
    );
  }
  console.log(`Reports written to ${reportDir}`);
  console.log(`Owner mission briefing available at ${path.join(reportDir, 'owner-digest.md')}`);
}

main();
