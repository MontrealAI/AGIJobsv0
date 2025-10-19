#!/usr/bin/env ts-node

import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { time, mine } from '@nomicfoundation/hardhat-network-helpers';
import { ethers, network } from 'hardhat';

const OUTPUT_DIR = resolve(__dirname, '..', '..', 'demo', 'agi-governance', 'reports');
const K_BOLTZMANN = 1.380649e-23;
const TEMPERATURE_K = 310.15; // physiological steady-state in Kelvin
const LANDAUER_BOUND = K_BOLTZMANN * TEMPERATURE_K * Math.log(2);

interface TimelineEntry {
  id: number;
  title: string;
  actor: string;
  timestamp: number;
  details: Record<string, unknown>;
}

interface QVRecord {
  actor: string;
  votes: bigint;
  cost: bigint;
}

interface ThermodynamicReport {
  hamiltonianEnergy: number;
  freeEnergyDelta: number;
  entropyIndex: number;
  landauerRatio: number;
  monteCarloEntropyMean: number;
  monteCarloEntropyStd: number;
}

interface NationSnapshot {
  id: string;
  governor: string;
  votingWeight: number;
  active: boolean;
  metadataURI: string;
}

interface FinalStateReport {
  network: string;
  governor: string;
  timelock: string;
  quadraticVoting: string;
  governanceCouncil: string;
  pauserRole: string;
  paused: boolean;
  treasury: string;
  treasuryBalance: string;
  proposalCount: number;
  nations: NationSnapshot[];
}

function pseudoRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 2 ** 32;
    return value / 2 ** 32;
  };
}

function computeEntropy(weights: number[]): number {
  const total = weights.reduce((acc, w) => acc + w, 0);
  const probs = weights.map((w) => (w <= 0 ? 0 : w / total));
  return -probs.reduce((acc, p) => (p > 0 ? acc + p * Math.log(p) : acc), 0);
}

function computeHamiltonian(records: QVRecord[]): number {
  return records.reduce((acc, entry) => acc + Number(ethers.formatUnits(entry.cost, 18)), 0);
}

function computeHamiltonianFromVotes(records: QVRecord[]): number {
  return records.reduce((acc, entry) => acc + Number(entry.votes) * Number(entry.votes), 0);
}

function runMonteCarloEntropy(weights: number[], samples = 512): { mean: number; std: number } {
  const rng = pseudoRandom(1337);
  const entropySamples: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const perturbed = weights.map((weight) => weight * (0.98 + rng() * 0.04));
    entropySamples.push(computeEntropy(perturbed));
  }
  const mean = entropySamples.reduce((acc, value) => acc + value, 0) / entropySamples.length;
  const variance =
    entropySamples.reduce((acc, value) => acc + (value - mean) ** 2, 0) / entropySamples.length;
  return { mean, std: Math.sqrt(variance) };
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function renderMarkdownTimeline(entries: TimelineEntry[]): string {
  const header = ['# α-AGI Governance Mission Timeline', '', `Network: \`${network.name}\``, ''];
  const body = entries.map((entry) => {
    const iso = new Date(entry.timestamp * 1000).toISOString();
    const detailLines = Object.entries(entry.details)
      .map(([key, value]) => `    - **${key}:** ${typeof value === 'object' ? JSON.stringify(value) : value}`)
      .join('\n');
    return `## Step ${entry.id}: ${entry.title}\n- Actor: **${entry.actor}**\n- Timestamp: ${iso}\n${detailLines}`;
  });
  return `${[...header, ...body].join('\n\n')}\n`;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const timeline: TimelineEntry[] = [];
  const qvRecords: QVRecord[] = [];

  const signers = await ethers.getSigners();
  const owner = signers[0];
  const treasury = signers[1];
  const nations = [signers[2], signers[3], signers[4]];

  const nationLabels = ['Aurora Accord', 'Pacific Mesh', 'Atlas Coalition'];
  const validator = signers[5];

  // ---------------------------------------------------------------------------
  // Deploy governance primitives
  // ---------------------------------------------------------------------------
  const votesTokenFactory = await ethers.getContractFactory('MockVotesToken');
  const votesToken = await votesTokenFactory.deploy();
  await votesToken.waitForDeployment();

  timeline.push({
    id: timeline.length + 1,
    title: 'Deployed MockVotesToken',
    actor: 'Owner',
    timestamp: await time.latest(),
    details: {
      address: await votesToken.getAddress(),
    },
  });

  const timelockDelay = 2 * 24 * 60 * 60; // 2 days in seconds
  const timelockFactory = await ethers.getContractFactory('AGITimelock');
  const timelock = await timelockFactory.deploy(
    timelockDelay,
    [owner.address],
    [owner.address],
    owner.address,
  );
  await timelock.waitForDeployment();

  const votingDelayBlocks = 1;
  const votingPeriodBlocks = 12;
  const proposalThreshold = ethers.parseUnits('100', 18);
  const quorumFraction = 8; // 8%

  const governorFactory = await ethers.getContractFactory('AGIGovernor');
  const governor = await governorFactory.deploy(
    votesToken,
    timelock,
    votingDelayBlocks,
    votingPeriodBlocks,
    proposalThreshold,
    quorumFraction,
  );
  await governor.waitForDeployment();

  // Wire timelock roles to governor
  const proposerRole = await timelock.PROPOSER_ROLE();
  const executorRole = await timelock.EXECUTOR_ROLE();
  const cancellerRole = await timelock.CANCELLER_ROLE();

  await timelock.grantRole(proposerRole, await governor.getAddress());
  await timelock.grantRole(executorRole, ethers.ZeroAddress);
  await timelock.grantRole(cancellerRole, owner.address);
  await timelock.revokeRole(proposerRole, owner.address);
  await timelock.revokeRole(executorRole, owner.address);

  timeline.push({
    id: timeline.length + 1,
    title: 'Deployed AGI Governor and Timelock',
    actor: 'Owner',
    timestamp: await time.latest(),
    details: {
      governor: await governor.getAddress(),
      timelock: await timelock.getAddress(),
      votingDelayBlocks,
      votingPeriodBlocks,
      proposalThreshold: ethers.formatUnits(proposalThreshold, 18),
      quorumFraction,
    },
  });

  const quadraticVotingFactory = await ethers.getContractFactory('QuadraticVoting');
  const quadraticVoting = await quadraticVotingFactory.deploy(
    await votesToken.getAddress(),
    await governor.getAddress(),
  );
  await quadraticVoting.waitForDeployment();

  await quadraticVoting.setTreasury(treasury.address);

  timeline.push({
    id: timeline.length + 1,
    title: 'Deployed Quadratic Voting Exchange',
    actor: 'Owner',
    timestamp: await time.latest(),
    details: {
      address: await quadraticVoting.getAddress(),
      treasury: treasury.address,
    },
  });

  const councilFactory = await ethers.getContractFactory('GlobalGovernanceCouncil');
  const initialPauserRole = ethers.id('INITIAL_PAUSER');
  const council = await councilFactory.deploy(owner.address, initialPauserRole);
  await council.waitForDeployment();

  timeline.push({
    id: timeline.length + 1,
    title: 'Deployed Global Governance Council',
    actor: 'Owner',
    timestamp: await time.latest(),
    details: {
      address: await council.getAddress(),
      pauserRole: initialPauserRole,
    },
  });

  // ---------------------------------------------------------------------------
  // Distribute governance power
  // ---------------------------------------------------------------------------
  const mintPlan: Array<{ signer: typeof owner; amount: bigint; label: string }> = [
    { signer: owner, amount: ethers.parseUnits('1500000', 18), label: 'Owner' },
    { signer: nations[0], amount: ethers.parseUnits('600000', 18), label: nationLabels[0] },
    { signer: nations[1], amount: ethers.parseUnits('550000', 18), label: nationLabels[1] },
    { signer: nations[2], amount: ethers.parseUnits('500000', 18), label: nationLabels[2] },
    { signer: treasury, amount: ethers.parseUnits('250000', 18), label: 'Treasury' },
    { signer: validator, amount: ethers.parseUnits('350000', 18), label: 'Validator' },
  ];

  for (const entry of mintPlan) {
    const tx = await votesToken.mint(entry.signer.address, entry.amount);
    await tx.wait();
    const delegateTx = await votesToken.connect(entry.signer).delegate(entry.signer.address);
    await delegateTx.wait();
  }

  const totalSupply = await votesToken.totalSupply();
  const mintedTotal = mintPlan.reduce((acc, entry) => acc + entry.amount, 0n);
  assert(totalSupply === mintedTotal, 'Mint plan and total supply diverge');

  timeline.push({
    id: timeline.length + 1,
    title: 'Minted and Delegated Governance Power',
    actor: 'Owner',
    timestamp: await time.latest(),
    details: {
      totalSupply: ethers.formatUnits(totalSupply, 18),
      allocations: mintPlan.map((entry) => ({
        actor: entry.label,
        amount: ethers.formatUnits(entry.amount, 18),
      })),
    },
  });

  // ---------------------------------------------------------------------------
  // Register nations and initial mandates
  // ---------------------------------------------------------------------------
  const nationConfigs: Array<{ id: string; weight: number; metadata: string }> = [
    { id: 'NATION_AURORA', weight: 3200, metadata: 'ipfs://aurora-governance' },
    { id: 'NATION_PACIFIC', weight: 3000, metadata: 'ipfs://pacific-governance' },
    { id: 'NATION_ATLAS', weight: 2800, metadata: 'ipfs://atlas-governance' },
  ];

  for (let i = 0; i < nationConfigs.length; i += 1) {
    const config = nationConfigs[i];
    const registerTx = await council.registerNation(
      ethers.id(config.id),
      nations[i].address,
      config.weight,
      config.metadata,
    );
    await registerTx.wait();
  }

  timeline.push({
    id: timeline.length + 1,
    title: 'Registered Sovereign AGI Nations',
    actor: 'Owner',
    timestamp: await time.latest(),
    details: nationConfigs.map((config, index) => ({
      id: config.id,
      governor: nations[index].address,
      weight: config.weight,
      metadata: config.metadata,
    })),
  });

  // transfer council ownership to timelock for on-chain control
  const transferTx = await council.transferOwnership(await timelock.getAddress());
  await transferTx.wait();

  timeline.push({
    id: timeline.length + 1,
    title: 'Transferred Council Ownership to Timelock',
    actor: 'Owner',
    timestamp: await time.latest(),
    details: {
      newOwner: await timelock.getAddress(),
    },
  });

  // ---------------------------------------------------------------------------
  // Quadratic voting session funding antifragile defences
  // ---------------------------------------------------------------------------
  const qvProposalId = 1n;
  const qvDeadline = BigInt(await time.latest()) + 7200n;

  const qvVotesPlan: Array<{ signer: typeof owner; votes: bigint; label: string }> = [
    { signer: nations[0], votes: 80n, label: nationLabels[0] },
    { signer: nations[1], votes: 72n, label: nationLabels[1] },
    { signer: nations[2], votes: 65n, label: nationLabels[2] },
    { signer: validator, votes: 40n, label: 'Validator' },
  ];

  for (const entry of qvVotesPlan) {
    const cost = entry.votes * entry.votes;
    const approveTx = await votesToken
      .connect(entry.signer)
      .approve(await quadraticVoting.getAddress(), ethers.parseUnits(cost.toString(), 18));
    await approveTx.wait();

    const castTx = await quadraticVoting
      .connect(entry.signer)
      .castVote(qvProposalId, Number(entry.votes), Number(qvDeadline));
    await castTx.wait();

    qvRecords.push({ actor: entry.label, votes: entry.votes, cost: ethers.parseUnits(cost.toString(), 18) });
  }

  const executeTx = await quadraticVoting.execute(qvProposalId);
  await executeTx.wait();

  timeline.push({
    id: timeline.length + 1,
    title: 'Quadratic Voting Session Executed',
    actor: 'QuadraticVoting',
    timestamp: await time.latest(),
    details: {
      proposalId: qvProposalId.toString(),
      voters: qvRecords.map((record) => ({ actor: record.actor, votes: record.votes.toString() })),
      totalCost: ethers.formatUnits(await quadraticVoting.totalCost(qvProposalId), 18),
    },
  });

  // ---------------------------------------------------------------------------
  // Governance proposal 1: rotate pauser role and pause system
  // ---------------------------------------------------------------------------
  const newPauserRole = ethers.id('PAUSER_ALPHA_FIELD');
  const description1 = 'Mandate: Rotate pauser role and engage antifragile pause window';
  const descriptionHash1 = ethers.id(description1);

  const targets1 = [await council.getAddress(), await council.getAddress()];
  const values1 = [0n, 0n];
  const calldatas1 = [
    council.interface.encodeFunctionData('setPauserRole', [newPauserRole]),
    council.interface.encodeFunctionData('pause'),
  ];

  const expectedProposalId1 = await governor.hashProposal(targets1, values1, calldatas1, descriptionHash1);
  const proposeTx1 = await governor.propose(targets1, values1, calldatas1, description1);
  await proposeTx1.wait();
  const postProposalState1 = Number(await governor.state(expectedProposalId1));
  assert(
    postProposalState1 === 0 || postProposalState1 === 1,
    `Proposal should be pending or active immediately after creation, state=${postProposalState1}`,
  );

  await mine(votingDelayBlocks + 1);

  const voteTxOwner1 = await governor
    .connect(owner)
    .castVoteWithReason(expectedProposalId1, 1, 'Owner asserts antifragile pause');
  await voteTxOwner1.wait();

  for (const entry of qvVotesPlan) {
    const voteTx = await governor.connect(entry.signer).castVote(expectedProposalId1, 1);
    await voteTx.wait();
  }

  await mine(votingPeriodBlocks + 1);

  const queueTx1 = await governor.queue(targets1, values1, calldatas1, descriptionHash1);
  await queueTx1.wait();

  await time.increase(timelockDelay + 1);
  await mine(1);

  const executeTx1 = await governor.execute(targets1, values1, calldatas1, descriptionHash1);
  await executeTx1.wait();

  const pausedStatusAfterFirst = await council.paused();
  const pauserRoleAfterFirst = await council.pauserRole();

  timeline.push({
    id: timeline.length + 1,
    title: 'Executed Proposal 1: Rotated Pauser and Paused Council',
    actor: 'Governor',
    timestamp: await time.latest(),
    details: {
      proposalId: expectedProposalId1.toString(),
      paused: pausedStatusAfterFirst,
      pauserRole: pauserRoleAfterFirst,
    },
  });

  // ---------------------------------------------------------------------------
  // Governance proposal 2: unpause and upgrade nation weight
  // ---------------------------------------------------------------------------
  const updatedWeight = nationConfigs[0].weight + 450;
  const description2 = 'Mandate: Restart alpha-field and elevate Aurora Accord weight';
  const descriptionHash2 = ethers.id(description2);

  const targets2 = [await council.getAddress(), await council.getAddress()];
  const values2 = [0n, 0n];
  const calldatas2 = [
    council.interface.encodeFunctionData('unpause'),
    council.interface.encodeFunctionData('updateNation', [
      ethers.id(nationConfigs[0].id),
      nations[0].address,
      updatedWeight,
      true,
      nationConfigs[0].metadata,
    ]),
  ];

  const expectedProposalId2 = await governor.hashProposal(targets2, values2, calldatas2, descriptionHash2);
  const proposeTx2 = await governor.propose(targets2, values2, calldatas2, description2);
  await proposeTx2.wait();

  await mine(votingDelayBlocks + 1);

  const voteOwner2 = await governor
    .connect(owner)
    .castVoteWithReason(expectedProposalId2, 1, 'Owner resumes global mission');
  await voteOwner2.wait();

  for (const entry of qvVotesPlan) {
    const voteTx = await governor.connect(entry.signer).castVote(expectedProposalId2, 1);
    await voteTx.wait();
  }

  await mine(votingPeriodBlocks + 1);

  const queueTx2 = await governor.queue(targets2, values2, calldatas2, descriptionHash2);
  await queueTx2.wait();

  await time.increase(timelockDelay + 1);
  await mine(1);

  const executeTx2 = await governor.execute(targets2, values2, calldatas2, descriptionHash2);
  await executeTx2.wait();

  const pausedStatusAfterSecond = await council.paused();
  const nationZero = await council.getNation(ethers.id(nationConfigs[0].id));

  timeline.push({
    id: timeline.length + 1,
    title: 'Executed Proposal 2: Council Reactivated and Nation Weight Elevated',
    actor: 'Governor',
    timestamp: await time.latest(),
    details: {
      proposalId: expectedProposalId2.toString(),
      paused: pausedStatusAfterSecond,
      updatedNationWeight: updatedWeight,
    },
  });

  assert(pausedStatusAfterSecond === false, 'Council should be unpaused after proposal 2');
  assert(Number(nationZero.votingWeight) === updatedWeight, 'Nation weight must be updated');

  // ---------------------------------------------------------------------------
  // Thermodynamic analytics
  // ---------------------------------------------------------------------------
  const directHamiltonian = computeHamiltonian(qvRecords);
  const analyticHamiltonian = computeHamiltonianFromVotes(qvRecords);
  const simulatedHamiltonian = qvRecords.reduce(
    (acc, record) => acc + Number(record.votes * record.votes),
    0,
  );

  assert(
    Math.abs(directHamiltonian - analyticHamiltonian) < 1e-6,
    'Hamiltonian mismatch between direct and analytic calculations',
  );
  assert(
    Math.abs(directHamiltonian - simulatedHamiltonian) < 1e-6,
    'Hamiltonian mismatch between direct and simulated calculations',
  );

  const entropyIndex = computeEntropy(nationConfigs.map((config, index) =>
    index === 0 ? updatedWeight : config.weight,
  ));
  const { mean: entropyMean, std: entropyStd } = runMonteCarloEntropy(
    nationConfigs.map((config, index) => (index === 0 ? updatedWeight : config.weight)),
  );

  assert(
    Math.abs(entropyIndex - entropyMean) <= 3 * entropyStd,
    'Entropy index deviates from Monte Carlo envelope',
  );

  const freeEnergyDelta = directHamiltonian - TEMPERATURE_K * entropyIndex;
  const landauerRatio = directHamiltonian / LANDAUER_BOUND;

  const thermoReport: ThermodynamicReport = {
    hamiltonianEnergy: directHamiltonian,
    freeEnergyDelta,
    entropyIndex,
    landauerRatio,
    monteCarloEntropyMean: entropyMean,
    monteCarloEntropyStd: entropyStd,
  };

  timeline.push({
    id: timeline.length + 1,
    title: 'Computed Thermodynamic Diagnostics',
    actor: 'Analysis Engine',
    timestamp: await time.latest(),
    details: thermoReport,
  });

  // ---------------------------------------------------------------------------
  // Final state snapshot
  // ---------------------------------------------------------------------------
  const nationsFinal: NationSnapshot[] = [];
  for (const config of nationConfigs) {
    const snapshot = await council.getNation(ethers.id(config.id));
    nationsFinal.push({
      id: config.id,
      governor: snapshot.governor,
      votingWeight: Number(snapshot.votingWeight),
      active: snapshot.active,
      metadataURI: snapshot.metadataURI,
    });
  }

  const finalState: FinalStateReport = {
    network: network.name,
    governor: await governor.getAddress(),
    timelock: await timelock.getAddress(),
    quadraticVoting: await quadraticVoting.getAddress(),
    governanceCouncil: await council.getAddress(),
    pauserRole: await council.pauserRole(),
    paused: await council.paused(),
    treasury: treasury.address,
    treasuryBalance: ethers.formatUnits(await votesToken.balanceOf(treasury.address), 18),
    proposalCount: 2,
    nations: nationsFinal,
  };

  timeline.push({
    id: timeline.length + 1,
    title: 'Captured Final State Snapshot',
    actor: 'Observer',
    timestamp: await time.latest(),
    details: finalState,
  });

  // ---------------------------------------------------------------------------
  // Persist artefacts
  // ---------------------------------------------------------------------------
  writeJson(resolve(OUTPUT_DIR, 'mission-timeline.json'), timeline);
  writeJson(resolve(OUTPUT_DIR, 'thermodynamics.json'), thermoReport);
  writeJson(resolve(OUTPUT_DIR, 'final-state.json'), finalState);
  writeFileSync(resolve(OUTPUT_DIR, 'mission-timeline.md'), renderMarkdownTimeline(timeline), 'utf8');

  console.log('\n✅ α-AGI Governance drill completed successfully. Reports written to:', OUTPUT_DIR);
}

main().catch((error) => {
  console.error('❌ α-AGI Governance drill failed:', error);
  process.exitCode = 1;
});
