import fs from 'fs';
import path from 'path';
import yargs, { ArgumentsCamelCase, Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ValidatorConstellationDemo } from '../src/core/constellation';
import {
  OperatorState,
  OperatorValidator,
  OperatorAgent,
  OperatorNode,
  OperatorDomain,
  createInitialOperatorState,
  ensureOperatorState,
  loadOperatorState,
  saveOperatorState,
  buildDemoFromOperatorState,
  refreshStateFromDemo,
  upsertEnsLeaf,
  generateOperatorMermaid,
  formatValidatorStake,
  formatAgentBudget,
} from '../src/core/operatorState';
import { demoJobBatch, budgetOverrunAction } from '../src/core/fixtures';
import { writeReportArtifacts } from '../src/core/reporting';
import { subgraphIndexer } from '../src/core/subgraph';
import { AgentAction, GovernanceParameters, Hex, SlashingEvent, VoteValue } from '../src/core/types';
import { selectCommittee } from '../src/core/vrf';

const DEFAULT_STATE_PATH = path.join(__dirname, '..', 'reports', 'operator-console', 'operator-state.json');
const DEFAULT_REPORT_BASE = path.join(__dirname, '..', 'reports', 'operator-console');

interface GlobalOptions {
  state?: string;
}

function resolveStatePath(state?: string): string {
  return path.resolve(state ?? DEFAULT_STATE_PATH);
}

function ensureDirectory(target: string): void {
  fs.mkdirSync(target, { recursive: true });
}

function assertHex(value: string, field: string): Hex {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`expected hex string for ${field}`);
  }
  return value as Hex;
}

function parseBigIntInput(value: string | number | bigint, field: string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`invalid numeric input for ${field}`);
    }
    return BigInt(value);
  }
  const sanitized = value.replace(/_/g, '').trim();
  if (sanitized.length === 0) {
    throw new Error(`empty numeric value for ${field}`);
  }
  if (/^0x[0-9a-fA-F]+$/.test(sanitized)) {
    return BigInt(sanitized);
  }
  return BigInt(sanitized);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function printHeading(title: string): void {
  console.log('='.repeat(title.length));
  console.log(title);
  console.log('='.repeat(title.length));
}

function describeState(state: OperatorState, mermaid = false): void {
  printHeading('Validator Constellation Operator Console');
  console.log('Governance Parameters:', state.governance);
  console.log('Sentinel Grace Ratio:', formatPercent(state.sentinelGraceRatio));
  console.log('ZK Verifying Key:', `${state.verifyingKey.slice(0, 18)}…`);
  console.log('Entropy Sources:', {
    onChainEntropy: state.onChainEntropy,
    recentBeacon: state.recentBeacon,
  });
  console.log('\nValidators:');
  state.validators.forEach((validator) => {
    console.log(`  - ${validator.ensName} (${validator.address}) :: ${formatValidatorStake(validator.stake)} :: ${validator.status}`);
  });
  console.log('\nAgents:');
  state.agents.forEach((agent) => {
    console.log(
      `  - ${agent.ensName} (${agent.address}) :: domain=${agent.domainId} :: budget=${formatAgentBudget(agent.budget)}`,
    );
  });
  console.log('\nDomains:');
  state.domains.forEach((domain) => {
    const pauseInfo = domain.paused && domain.pauseReason ? `paused (${domain.pauseReason.reason})` : 'active';
    console.log(
      `  - ${domain.id} :: ${domain.humanName} :: budget=${formatAgentBudget(domain.budgetLimit)} :: ${pauseInfo} :: unsafe=${domain.unsafeOpcodes.join(', ') || 'none'}`,
    );
  });
  console.log('\nNodes:');
  state.nodes.forEach((node) => {
    console.log(`  - ${node.ensName} (${node.address})`);
  });
  if (mermaid) {
    console.log('\nMermaid Blueprint:');
    console.log('```mermaid');
    console.log(generateOperatorMermaid(state));
    console.log('```');
  }
}

function withDemo<T>(
  state: OperatorState,
  action: (demo: ValidatorConstellationDemo) => T,
  options?: { slashingEvents?: SlashingEvent[] },
): { state: OperatorState; result: T } {
  const demo = buildDemoFromOperatorState(state);
  const result = action(demo);
  refreshStateFromDemo(state, demo, { slashingEvents: options?.slashingEvents });
  return { state, result };
}

function ensureAgent(state: OperatorState, ensName: string): OperatorAgent {
  const agent = state.agents.find((candidate) => candidate.ensName === ensName);
  if (!agent) {
    throw new Error(`unknown agent ${ensName}`);
  }
  return agent;
}

function ensureValidator(state: OperatorState, ensName: string): OperatorValidator {
  const validator = state.validators.find((candidate) => candidate.ensName === ensName);
  if (!validator) {
    throw new Error(`unknown validator ${ensName}`);
  }
  return validator;
}

function ensureDomain(state: OperatorState, domainId: string): OperatorDomain {
  const domain = state.domains.find((candidate) => candidate.id === domainId);
  if (!domain) {
    throw new Error(`unknown domain ${domainId}`);
  }
  return domain;
}

function ensureNode(state: OperatorState, ensName: string): OperatorNode | undefined {
  return state.nodes.find((candidate) => candidate.ensName === ensName);
}

function parseVote(value: string | undefined, fallback: VoteValue): VoteValue {
  if (!value) {
    return fallback;
  }
  const upper = value.toUpperCase();
  if (upper === 'APPROVE' || upper === 'REJECT') {
    return upper;
  }
  throw new Error('vote must be APPROVE or REJECT');
}

function summaryForAction(action: string, details: unknown): void {
  console.log(`\nAction: ${action}`);
  if (typeof details === 'string') {
    console.log(details);
  } else {
    console.log(JSON.stringify(details, null, 2));
  }
}

type InitArgs = ArgumentsCamelCase<{ force: boolean; mermaid: boolean } & GlobalOptions>;

function handleInit(argv: InitArgs): void {
  const statePath = resolveStatePath(argv.state);
  if (fs.existsSync(statePath) && !argv.force) {
    console.log(`State already exists at ${statePath}. Use --force to overwrite.`);
    return;
  }
  ensureDirectory(path.dirname(statePath));
  const state = createInitialOperatorState();
  saveOperatorState(state, statePath);
  describeState(state, argv.mermaid);
}

type StatusArgs = ArgumentsCamelCase<{ mermaid: boolean } & GlobalOptions>;

function handleStatus(argv: StatusArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = ensureOperatorState(statePath);
  describeState(state, argv.mermaid);
}

type GovernanceArgs = ArgumentsCamelCase<
  GlobalOptions &
    Partial<{ committeeSize: number; commitBlocks: number; revealBlocks: number; quorum: number; slashBps: number; nonRevealBps: number }>
>;

function handleGovernance(argv: GovernanceArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  const updates: Array<[keyof GovernanceParameters, number | undefined]> = [
    ['committeeSize', argv.committeeSize],
    ['commitPhaseBlocks', argv.commitBlocks],
    ['revealPhaseBlocks', argv.revealBlocks],
    ['quorumPercentage', argv.quorum],
    ['slashPenaltyBps', argv.slashBps],
    ['nonRevealPenaltyBps', argv.nonRevealBps],
  ];
  let changes = 0;
  const { state: updated } = withDemo(state, (demo) => {
    updates.forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`invalid governance value for ${key}`);
      }
      demo.updateGovernanceParameter(key, value);
      changes += 1;
    });
  });
  if (changes === 0) {
    console.log('No governance updates supplied.');
  }
  saveOperatorState(updated, statePath);
  summaryForAction('governance-updated', updated.governance);
}

type SentinelArgs = ArgumentsCamelCase<{ budgetGrace?: number } & GlobalOptions>;

function handleSentinel(argv: SentinelArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  if (argv.budgetGrace === undefined) {
    console.log('Provide --budget-grace to update sentinel configuration.');
    return;
  }
  if (argv.budgetGrace < 0 || argv.budgetGrace > 1) {
    throw new Error('budget grace ratio must be between 0 and 1');
  }
  const { state: updated } = withDemo(state, (demo) => {
    demo.updateSentinelConfig({ budgetGraceRatio: argv.budgetGrace });
  });
  saveOperatorState(updated, statePath);
  summaryForAction('sentinel-updated', { budgetGraceRatio: updated.sentinelGraceRatio });
}

type DomainArgs = ArgumentsCamelCase<
  GlobalOptions &
    {
      domain: string;
      humanName?: string;
      budgetLimit?: string;
      unsafeOpcode?: string[];
    }
>;

function handleDomain(argv: DomainArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  const domain = ensureDomain(state, argv.domain);
  const updates: {
    humanName?: string;
    budgetLimit?: bigint;
    unsafeOpcodes?: string[];
  } = {};
  if (argv.humanName) {
    updates.humanName = argv.humanName;
  }
  if (argv.budgetLimit) {
    updates.budgetLimit = parseBigIntInput(argv.budgetLimit, 'budget limit');
  }
  if (argv.unsafeOpcode) {
    updates.unsafeOpcodes = argv.unsafeOpcode[0] === 'none' ? [] : argv.unsafeOpcode;
  }
  const { state: updated, result } = withDemo(state, (demo) => demo.updateDomainSafety(argv.domain, updates));
  saveOperatorState(updated, statePath);
  summaryForAction('domain-updated', {
    before: domain,
    after: result,
  });
}

type AgentBudgetArgs = ArgumentsCamelCase<{ agent: string; budget: string } & GlobalOptions>;

function handleAgentBudget(argv: AgentBudgetArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  const agent = ensureAgent(state, argv.agent);
  const budget = parseBigIntInput(argv.budget, 'agent budget');
  agent.budget = budget.toString();
  const { state: updated } = withDemo(state, (demo) => {
    demo.setAgentBudget(agent.ensName, budget);
  });
  saveOperatorState(updated, statePath);
  summaryForAction('agent-budget-updated', ensureAgent(updated, argv.agent));
}

type PauseArgs = ArgumentsCamelCase<{ domain: string; reason?: string } & GlobalOptions>;

function handlePause(argv: PauseArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  const reason = argv.reason ?? 'operator:manual-pause';
  const { state: updated, result } = withDemo(state, (demo) => demo.pauseDomain(argv.domain, reason));
  saveOperatorState(updated, statePath);
  summaryForAction('domain-paused', result);
}

type ResumeArgs = ArgumentsCamelCase<{ domain: string } & GlobalOptions>;

function handleResume(argv: ResumeArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  const { state: updated, result } = withDemo(state, (demo) => demo.resumeDomain(argv.domain));
  saveOperatorState(updated, statePath);
  summaryForAction('domain-resumed', result);
}

type EntropyArgs = ArgumentsCamelCase<{ onChain?: string; beacon?: string } & GlobalOptions>;

function handleEntropy(argv: EntropyArgs): void {
  if (!argv.onChain && !argv.beacon) {
    throw new Error('provide --on-chain and/or --beacon to rotate entropy');
  }
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  const update: { onChainEntropy?: Hex; recentBeacon?: Hex } = {};
  if (argv.onChain) {
    update.onChainEntropy = assertHex(argv.onChain, 'on-chain entropy');
  }
  if (argv.beacon) {
    update.recentBeacon = assertHex(argv.beacon, 'beacon entropy');
  }
  const { state: updated, result } = withDemo(state, (demo) => demo.updateEntropySources(update));
  saveOperatorState(updated, statePath);
  summaryForAction('entropy-rotated', result);
}

type ZkArgs = ArgumentsCamelCase<{ verifyingKey: string } & GlobalOptions>;

function handleZk(argv: ZkArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  const verifyingKey = assertHex(argv.verifyingKey, 'verifying key');
  const { state: updated } = withDemo(state, (demo) => {
    demo.updateZkVerifyingKey(verifyingKey);
  });
  saveOperatorState(updated, statePath);
  summaryForAction('zk-verifying-key-rotated', { verifyingKey: updated.verifyingKey });
}

type BondValidatorArgs = ArgumentsCamelCase<{ ens: string; stake: string; address?: string } & GlobalOptions>;

function handleBondValidator(argv: BondValidatorArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  const stake = parseBigIntInput(argv.stake, 'validator stake');
  const address = argv.address ? assertHex(argv.address, 'validator address') : undefined;
  const existingLeaf = state.leaves.find((leaf) => leaf.ensName === argv.ens);
  const resolvedAddress: Hex = address ?? existingLeaf?.owner ?? (() => {
      throw new Error('validator ENS not present in registry, supply --address');
    })();
  upsertEnsLeaf(state, { ensName: argv.ens, owner: resolvedAddress });
  const existing = state.validators.find((candidate) => candidate.ensName === argv.ens);
  if (existing) {
    existing.address = resolvedAddress;
    existing.stake = stake.toString();
    existing.status = 'ACTIVE';
  } else {
    state.validators.push({ ensName: argv.ens, address: resolvedAddress, stake: stake.toString(), status: 'ACTIVE' });
  }
  const { state: updated } = withDemo(state, () => undefined);
  saveOperatorState(updated, statePath);
  summaryForAction('validator-bonded', ensureValidator(updated, argv.ens));
}

type RegisterAgentArgs = ArgumentsCamelCase<{ ens: string; domain: string; budget: string; address?: string } & GlobalOptions>;

function handleRegisterAgent(argv: RegisterAgentArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  ensureDomain(state, argv.domain);
  const budget = parseBigIntInput(argv.budget, 'agent budget');
  const address = argv.address
    ? assertHex(argv.address, 'agent address')
    : state.leaves.find((leaf) => leaf.ensName === argv.ens)?.owner;
  if (!address) {
    throw new Error('agent ENS not present in registry, provide --address');
  }
  upsertEnsLeaf(state, { ensName: argv.ens, owner: address });
  const existing = state.agents.find((candidate) => candidate.ensName === argv.ens);
  if (existing) {
    existing.address = address;
    existing.domainId = argv.domain;
    existing.budget = budget.toString();
  } else {
    state.agents.push({ ensName: argv.ens, address, domainId: argv.domain, budget: budget.toString() });
  }
  const { state: updated } = withDemo(state, () => undefined);
  saveOperatorState(updated, statePath);
  summaryForAction('agent-registered', ensureAgent(updated, argv.ens));
}

type RegisterNodeArgs = ArgumentsCamelCase<{ ens: string; address?: string } & GlobalOptions>;

function handleRegisterNode(argv: RegisterNodeArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  const address = argv.address
    ? assertHex(argv.address, 'node address')
    : state.leaves.find((leaf) => leaf.ensName === argv.ens)?.owner;
  if (!address) {
    throw new Error('node ENS not present in registry, provide --address');
  }
  upsertEnsLeaf(state, { ensName: argv.ens, owner: address });
  const existing = ensureNode(state, argv.ens);
  if (existing) {
    existing.address = address;
  } else {
    state.nodes.push({ ensName: argv.ens, address });
  }
  const { state: updated } = withDemo(state, () => undefined);
  saveOperatorState(updated, statePath);
  summaryForAction('node-registered', argv.ens);
}

type RunRoundArgs = ArgumentsCamelCase<
  GlobalOptions & {
    domain?: string;
    round?: number;
    jobs?: number;
    truthful?: string;
    dishonest?: boolean;
    nonReveal?: number;
    overspend?: string;
    unsafeOpcode?: string;
    signature?: string;
    reportName?: string;
    mermaid?: boolean;
  }
>;

function handleRunRound(argv: RunRoundArgs): void {
  const statePath = resolveStatePath(argv.state);
  const state = loadOperatorState(statePath);
  const domainId = argv.domain ?? state.domains[0]?.id ?? (() => {
      throw new Error('no domains registered in state');
    })();
  const agent = state.agents.find((candidate) => candidate.domainId === domainId);
  if (!agent) {
    throw new Error(`no agent registered for domain ${domainId}`);
  }
  const round = argv.round ?? 1;
  const jobs = argv.jobs ?? 256;
  const truthfulVote = parseVote(argv.truthful, 'APPROVE');
  const signature = argv.signature
    ? assertHex(argv.signature, 'committee signature')
    : ('0x777788889999aaaabbbbccccddddeeeeffff0000111122223333444455556666' as Hex);
  const overspend = argv.overspend ? parseBigIntInput(argv.overspend, 'overspend') : 0n;
  const demo = buildDemoFromOperatorState(state);
  subgraphIndexer.clear();
  const jobBatch = demoJobBatch(domainId, jobs);
  const entropyBefore = demo.getEntropySources();
  const selection = selectCommittee(
    demo.listValidators(),
    domainId,
    round,
    demo.getGovernance(),
    entropyBefore.onChainEntropy,
    entropyBefore.recentBeacon,
  );
  console.log('Entropy witness for operator round:', selection.witness);
  const voteOverrides: Record<string, VoteValue> = {};
  if (argv.dishonest && selection.committee[0]) {
    voteOverrides[selection.committee[0].address] = truthfulVote === 'APPROVE' ? 'REJECT' : 'APPROVE';
  }
  const nonReveal = argv.nonReveal && argv.nonReveal > 0 ? selection.committee.slice(0, argv.nonReveal).map((member) => member.address) : [];
  const agentIdentity = demo.findAgent(agent.ensName);
  if (!agentIdentity) {
    throw new Error(`agent identity ${agent.ensName} missing`);
  }
  const anomalies: AgentAction[] = [];
  if (overspend > 0n) {
    anomalies.push(
      budgetOverrunAction(
        agentIdentity.ensName,
        agentIdentity.address,
        domainId,
        overspend,
        BigInt(agent.budget),
      ),
    );
  }
  if (argv.unsafeOpcode) {
    anomalies.push({
      agent: agentIdentity,
      domainId,
      type: 'CALL',
      amountSpent: 1_000n,
      opcode: argv.unsafeOpcode,
      description: 'Operator-specified unsafe opcode probe',
    });
  }
  const roundResult = demo.runValidationRound({
    round,
    truthfulVote,
    jobBatch,
    committeeSignature: signature,
    voteOverrides,
    nonRevealValidators: nonReveal,
    anomalies,
  });
  const reportDir = path.join(DEFAULT_REPORT_BASE, argv.reportName ?? `operator-round-${round}`);
  ensureDirectory(reportDir);
  const context = {
    verifyingKey: demo.getZkVerifyingKey(),
    entropyBefore,
    entropyAfter: demo.getEntropySources(),
    governance: demo.getGovernance(),
    sentinelGraceRatio: demo.getSentinelBudgetGraceRatio(),
    nodesRegistered: demo.listNodes(),
    primaryDomain: demo.getDomainState(domainId),
    scenarioName: argv.reportName ?? `Operator Round ${round}`,
    ownerNotes: {
      command: 'run-round',
      params: {
        domainId,
        round,
        jobs,
        truthfulVote,
        dishonest: argv.dishonest ?? false,
        nonReveal: nonReveal.length,
        overspend: overspend.toString(),
        unsafeOpcode: argv.unsafeOpcode,
      },
    },
    jobSample: jobBatch.slice(0, Math.min(jobBatch.length, 8)),
  };
  writeReportArtifacts({
    reportDir,
    roundResult,
    subgraphRecords: subgraphIndexer.list(),
    events: [selection.witness, ...roundResult.commits, ...roundResult.reveals],
    context,
  });
  summaryForAction('validation-round-executed', {
    reportDir,
    attestedJobs: roundResult.proof.attestedJobCount,
    slashingEvents: roundResult.slashingEvents.length,
    sentinelAlerts: roundResult.sentinelAlerts.length,
    vrfTranscript: roundResult.vrfWitness.transcript,
  });
  refreshStateFromDemo(state, demo, { slashingEvents: roundResult.slashingEvents });
  if (argv.mermaid) {
    console.log('\nMermaid Blueprint for round:');
    console.log('```mermaid');
    console.log(generateOperatorMermaid(state));
    console.log('```');
  }
  saveOperatorState(state, statePath);
}

function createCli(argv: string[]): void {
  yargs(hideBin(argv))
    .scriptName('validator-constellation')
    .option('state', {
      type: 'string',
      describe: 'Path to operator state file',
      global: true,
    })
    .command(
      'init',
      'Bootstrap a fresh operator state',
      (cmd: Argv) =>
        cmd
          .option('force', { type: 'boolean', default: false, describe: 'Overwrite existing state' })
          .option('mermaid', { type: 'boolean', default: true, describe: 'Render a mermaid blueprint' }),
      handleInit,
    )
    .command(
      'status',
      'Display the current operator state',
      (cmd: Argv) => cmd.option('mermaid', { type: 'boolean', default: false, describe: 'Render mermaid output' }),
      handleStatus,
    )
    .command(
      'set-governance',
      'Update governance levers',
      (cmd: Argv) =>
        cmd
          .option('committee-size', { type: 'number', describe: 'Validator committee size' })
          .option('commit-blocks', { type: 'number', describe: 'Commit phase blocks' })
          .option('reveal-blocks', { type: 'number', describe: 'Reveal phase blocks' })
          .option('quorum', { type: 'number', describe: 'Quorum percentage' })
          .option('slash-bps', { type: 'number', describe: 'Slash penalty (bps)' })
          .option('non-reveal-bps', { type: 'number', describe: 'Non-reveal penalty (bps)' }),
      handleGovernance,
    )
    .command(
      'set-sentinel',
      'Update sentinel guardrails',
      (cmd: Argv) => cmd.option('budget-grace', { type: 'number', describe: 'Budget grace ratio (0-1)' }),
      handleSentinel,
    )
    .command(
      'set-domain',
      'Update domain configuration',
      (cmd: Argv) =>
        cmd
          .option('domain', { type: 'string', demandOption: true, describe: 'Domain identifier' })
          .option('human-name', { type: 'string', describe: 'Human readable name' })
          .option('budget-limit', { type: 'string', describe: 'Budget limit (wei)' })
          .option('unsafe-opcode', { type: 'array', string: true, describe: 'Unsafe opcode list (use "none" to clear)' }),
      handleDomain,
    )
    .command(
      'set-agent-budget',
      'Adjust an agent budget',
      (cmd: Argv) =>
        cmd
          .option('agent', { type: 'string', demandOption: true, describe: 'Agent ENS name' })
          .option('budget', { type: 'string', demandOption: true, describe: 'Agent budget (wei)' }),
      handleAgentBudget,
    )
    .command(
      'pause-domain',
      'Pause a domain manually',
      (cmd: Argv) =>
        cmd
          .option('domain', { type: 'string', demandOption: true, describe: 'Domain identifier' })
          .option('reason', { type: 'string', describe: 'Pause reason' }),
      handlePause,
    )
    .command(
      'resume-domain',
      'Resume a paused domain',
      (cmd: Argv) => cmd.option('domain', { type: 'string', demandOption: true, describe: 'Domain identifier' }),
      handleResume,
    )
    .command(
      'rotate-entropy',
      'Rotate VRF entropy sources',
      (cmd: Argv) =>
        cmd
          .option('on-chain', { type: 'string', describe: 'New on-chain entropy hex' })
          .option('beacon', { type: 'string', describe: 'New beacon entropy hex' }),
      handleEntropy,
    )
    .command(
      'rotate-zk',
      'Rotate the ZK verifying key',
      (cmd: Argv) => cmd.option('verifying-key', { type: 'string', demandOption: true, describe: 'New verifying key hex' }),
      handleZk,
    )
    .command(
      'bond-validator',
      'Register or rebond a validator',
      (cmd: Argv) =>
        cmd
          .option('ens', { type: 'string', demandOption: true, describe: 'Validator ENS name' })
          .option('stake', { type: 'string', demandOption: true, describe: 'Stake amount (wei)' })
          .option('address', { type: 'string', describe: 'Validator owner address' }),
      handleBondValidator,
    )
    .command(
      'register-agent',
      'Register or update an agent',
      (cmd: Argv) =>
        cmd
          .option('ens', { type: 'string', demandOption: true, describe: 'Agent ENS name' })
          .option('domain', { type: 'string', demandOption: true, describe: 'Domain identifier' })
          .option('budget', { type: 'string', demandOption: true, describe: 'Budget amount (wei)' })
          .option('address', { type: 'string', describe: 'Agent owner address' }),
      handleRegisterAgent,
    )
    .command(
      'register-node',
      'Register or update a node controller',
      (cmd: Argv) =>
        cmd
          .option('ens', { type: 'string', demandOption: true, describe: 'Node ENS name' })
          .option('address', { type: 'string', describe: 'Node owner address' }),
      handleRegisterNode,
    )
    .command(
      'run-round',
      'Execute a full validation round and produce a report deck',
      (cmd: Argv) =>
        cmd
          .option('domain', { type: 'string', describe: 'Domain identifier' })
          .option('round', { type: 'number', describe: 'Round number' })
          .option('jobs', { type: 'number', describe: 'Number of jobs to attest' })
          .option('truthful', { type: 'string', describe: 'Truthful vote outcome (APPROVE/REJECT)' })
          .option('dishonest', { type: 'boolean', default: false, describe: 'Force first validator to vote dishonestly' })
          .option('non-reveal', { type: 'number', describe: 'Number of non-revealing validators' })
          .option('overspend', { type: 'string', describe: 'Overspend amount (wei)' })
          .option('unsafe-opcode', { type: 'string', describe: 'Inject an unsafe opcode anomaly' })
          .option('signature', { type: 'string', describe: 'Committee signature hex' })
          .option('report-name', { type: 'string', describe: 'Custom report folder name' })
          .option('mermaid', { type: 'boolean', default: false, describe: 'Render mermaid blueprint after execution' }),
      handleRunRound,
    )
    .demandCommand(1)
    .strict()
    .help()
    .parse();
}

if (require.main === module) {
  createCli(process.argv);
}

export { createCli };
