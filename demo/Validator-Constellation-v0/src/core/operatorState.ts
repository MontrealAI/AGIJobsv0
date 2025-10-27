import fs from 'fs';
import path from 'path';
import { ValidatorConstellationDemo, DemoSetup } from './constellation';
import {
  AgentIdentity,
  DomainConfig,
  GovernanceParameters,
  Hex,
  NodeIdentity,
  SlashingEvent,
} from './types';
import { demoLeaves, demoSetup, defaultDomains } from './fixtures';
import { EnsLeaf } from './ens';

const ETH_DECIMALS = 18n;
const ETH_SCALING_FACTOR = 10n ** ETH_DECIMALS;

export interface OperatorValidator {
  ensName: string;
  address: Hex;
  stake: string;
  status: 'ACTIVE' | 'BANNED';
}

export interface OperatorAgent {
  ensName: string;
  address: Hex;
  domainId: string;
  budget: string;
}

export interface OperatorNode {
  ensName: string;
  address: Hex;
}

export interface OperatorDomainPause {
  reason: string;
  triggeredBy: string;
  timestamp: number;
  resumedAt?: number;
}

export interface OperatorDomain {
  id: string;
  humanName: string;
  budgetLimit: string;
  unsafeOpcodes: string[];
  paused: boolean;
  pauseReason?: OperatorDomainPause;
}

export interface OperatorState {
  version: number;
  leaves: EnsLeaf[];
  governance: GovernanceParameters;
  verifyingKey: Hex;
  sentinelGraceRatio: number;
  onChainEntropy: Hex;
  recentBeacon: Hex;
  validators: OperatorValidator[];
  agents: OperatorAgent[];
  nodes: OperatorNode[];
  domains: OperatorDomain[];
}

function cloneSetupFromState(state: OperatorState): DemoSetup {
  const domains: DomainConfig[] = state.domains.map((domain) => ({
    id: domain.id,
    humanName: domain.humanName,
    budgetLimit: BigInt(domain.budgetLimit),
    unsafeOpcodes: new Set(domain.unsafeOpcodes),
  }));
  return {
    domains,
    governance: { ...state.governance },
    ensLeaves: state.leaves.map((leaf) => ({ ...leaf })),
    verifyingKey: state.verifyingKey,
    onChainEntropy: state.onChainEntropy,
    recentBeacon: state.recentBeacon,
    sentinelGraceRatio: state.sentinelGraceRatio,
  };
}

function ensureDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toEtherString(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const integer = absolute / ETH_SCALING_FACTOR;
  const fraction = absolute % ETH_SCALING_FACTOR;
  if (fraction === 0n) {
    return `${sign}${integer.toString()} ETH`;
  }
  const fractionStr = fraction
    .toString()
    .padStart(Number(ETH_DECIMALS), '0')
    .replace(/0+$/, '')
    .slice(0, 6);
  return `${sign}${integer.toString()}.${fractionStr} ETH`;
}

function formatThousands(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const digits = absolute.toString();
  const withSeparators = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${withSeparators}`;
}

function sanitizeMermaidId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function createInitialOperatorState(): OperatorState {
  const leaves = demoLeaves();
  const setup = demoSetup(leaves);
  const validators: OperatorValidator[] = leaves.slice(0, 5).map((leaf) => ({
    ensName: leaf.ensName,
    address: leaf.owner,
    stake: '10000000000000000000',
    status: 'ACTIVE',
  }));
  const nova = leaves.find((leaf) => leaf.ensName === 'nova.agent.agi.eth');
  const sentinel = leaves.find((leaf) => leaf.ensName === 'sentinel.agent.agi.eth');
  if (!nova || !sentinel) {
    throw new Error('expected demo leaves to contain nova and sentinel agents');
  }
  const agents: OperatorAgent[] = [
    {
      ensName: nova.ensName,
      address: nova.owner,
      domainId: 'deep-space-lab',
      budget: '1000000',
    },
    {
      ensName: sentinel.ensName,
      address: sentinel.owner,
      domainId: 'lunar-foundry',
      budget: '750000',
    },
  ];
  const nodes: OperatorNode[] = leaves
    .filter((leaf) => leaf.ensName.includes('.node.agi.eth'))
    .map((leaf) => ({ ensName: leaf.ensName, address: leaf.owner }));
  const domains: OperatorDomain[] = setup.domains.map((domain) => ({
    id: domain.id,
    humanName: domain.humanName,
    budgetLimit: domain.budgetLimit.toString(),
    unsafeOpcodes: Array.from(domain.unsafeOpcodes),
    paused: false,
  }));
  return {
    version: 1,
    leaves: leaves.map((leaf) => ({ ...leaf })),
    governance: { ...setup.governance },
    verifyingKey: setup.verifyingKey,
    sentinelGraceRatio: setup.sentinelGraceRatio,
    onChainEntropy: setup.onChainEntropy,
    recentBeacon: setup.recentBeacon,
    validators,
    agents,
    nodes,
    domains,
  };
}

export function saveOperatorState(state: OperatorState, filePath: string): void {
  ensureDirectory(filePath);
  const serialized = JSON.stringify(state, null, 2);
  fs.writeFileSync(filePath, serialized, 'utf8');
}

export function loadOperatorState(filePath: string): OperatorState {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as OperatorState;
  if (parsed.version !== 1) {
    throw new Error(`unsupported operator state version: ${parsed.version}`);
  }
  return {
    ...parsed,
    leaves: parsed.leaves.map((leaf) => ({ ...leaf })),
    governance: { ...parsed.governance },
    validators: parsed.validators.map((validator) => ({ ...validator })),
    agents: parsed.agents.map((agent) => ({ ...agent })),
    nodes: parsed.nodes.map((node) => ({ ...node })),
    domains: parsed.domains.map((domain) => ({
      ...domain,
      unsafeOpcodes: [...domain.unsafeOpcodes],
      pauseReason: domain.pauseReason ? { ...domain.pauseReason } : undefined,
    })),
  };
}

export function ensureOperatorState(filePath: string): OperatorState {
  if (fs.existsSync(filePath)) {
    return loadOperatorState(filePath);
  }
  const state = createInitialOperatorState();
  saveOperatorState(state, filePath);
  return state;
}

export function upsertEnsLeaf(state: OperatorState, leaf: EnsLeaf): void {
  const idx = state.leaves.findIndex((existing) => existing.ensName === leaf.ensName);
  if (idx >= 0) {
    state.leaves[idx] = { ...leaf };
  } else {
    state.leaves.push({ ...leaf });
  }
}

export function buildDemoFromOperatorState(state: OperatorState): ValidatorConstellationDemo {
  const setup = cloneSetupFromState(state);
  const demo = new ValidatorConstellationDemo(setup);
  for (const validator of state.validators) {
    if (validator.status === 'BANNED') {
      continue;
    }
    demo.registerValidator(validator.ensName, validator.address, BigInt(validator.stake));
  }
  for (const agent of state.agents) {
    const identity = demo.registerAgent(agent.ensName, agent.address, agent.domainId, BigInt(agent.budget));
    if (identity.budget.toString() !== agent.budget) {
      demo.setAgentBudget(agent.ensName, BigInt(agent.budget));
    }
  }
  for (const node of state.nodes) {
    demo.registerNode(node.ensName, node.address);
  }
  for (const domain of state.domains) {
    if (domain.paused && domain.pauseReason) {
      demo.pauseDomain(domain.id, domain.pauseReason.reason, domain.pauseReason.triggeredBy);
    }
  }
  return demo;
}

function updateAgentsFromDemo(state: OperatorState, demo: ValidatorConstellationDemo): void {
  state.agents = state.agents.map((agent) => {
    const identity = demo.findAgent(agent.ensName);
    if (!identity) {
      return agent;
    }
    return {
      ensName: identity.ensName,
      address: identity.address,
      domainId: identity.domainId,
      budget: identity.budget.toString(),
    };
  });
}

function updateNodesFromDemo(state: OperatorState, demo: ValidatorConstellationDemo): void {
  const registered = demo.listNodes();
  const map = new Map<string, NodeIdentity>();
  for (const node of registered) {
    map.set(node.ensName, node);
  }
  state.nodes = state.nodes.map((node) => {
    const resolved = map.get(node.ensName);
    return resolved ? { ensName: resolved.ensName, address: resolved.address } : node;
  });
}

function updateDomainsFromDemo(state: OperatorState, demo: ValidatorConstellationDemo): void {
  state.domains = state.domains.map((domain) => {
    const snapshot = demo.getDomainState(domain.id);
    return {
      id: snapshot.config.id,
      humanName: snapshot.config.humanName,
      budgetLimit: snapshot.config.budgetLimit.toString(),
      unsafeOpcodes: Array.from(snapshot.config.unsafeOpcodes),
      paused: snapshot.paused,
      pauseReason: snapshot.pauseReason
        ? {
            reason: snapshot.pauseReason.reason,
            triggeredBy: snapshot.pauseReason.triggeredBy,
            timestamp: snapshot.pauseReason.timestamp,
            resumedAt: snapshot.pauseReason.resumedAt,
          }
        : undefined,
    };
  });
}

function applySlashingEvents(state: OperatorState, events: SlashingEvent[] | undefined): void {
  if (!events || events.length === 0) {
    return;
  }
  const map = new Map<string, OperatorValidator>();
  for (const validator of state.validators) {
    map.set(validator.address, validator);
  }
  for (const event of events) {
    const record = map.get(event.validator.address);
    if (!record) {
      continue;
    }
    const currentStake = BigInt(record.stake);
    const nextStake = currentStake - event.penalty;
    record.stake = nextStake > 0n ? nextStake.toString() : '0';
    record.status = nextStake > 0n ? 'ACTIVE' : 'BANNED';
  }
}

export function refreshStateFromDemo(
  state: OperatorState,
  demo: ValidatorConstellationDemo,
  options: { slashingEvents?: SlashingEvent[] } = {},
): void {
  const entropy = demo.getEntropySources();
  state.onChainEntropy = entropy.onChainEntropy;
  state.recentBeacon = entropy.recentBeacon;
  state.verifyingKey = demo.getZkVerifyingKey();
  state.governance = { ...demo.getGovernance() };
  state.sentinelGraceRatio = demo.getSentinelBudgetGraceRatio();
  updateAgentsFromDemo(state, demo);
  updateNodesFromDemo(state, demo);
  updateDomainsFromDemo(state, demo);
  applySlashingEvents(state, options.slashingEvents);
}

export function formatValidatorStake(stake: string): string {
  return toEtherString(BigInt(stake));
}

export function formatAgentBudget(budget: string): string {
  return formatThousands(BigInt(budget));
}

export function generateOperatorMermaid(state: OperatorState): string {
  const governance = state.governance;
  const validatorNodes = state.validators
    .map((validator) => {
      const id = sanitizeMermaidId(`validator_${validator.ensName}`);
      return `    ${id}["${validator.ensName}\\n${formatValidatorStake(validator.stake)}\\n${validator.status}"]`;
    })
    .join('\n');
  const domainBlocks = state.domains
    .map((domain) => {
      const domainId = sanitizeMermaidId(`domain_${domain.id}`);
      const header = `${domain.humanName}\\nBudget ${formatAgentBudget(domain.budgetLimit)}\\nPaused: ${domain.paused ? 'YES' : 'NO'}`;
      const agents = state.agents
        .filter((agent) => agent.domainId === domain.id)
        .map((agent) => {
          const agentId = sanitizeMermaidId(`agent_${agent.ensName}`);
          return `      ${agentId}["${agent.ensName}\\nBudget ${formatAgentBudget(agent.budget)}"]`;
        })
        .join('\n');
      return `  subgraph ${domainId}["${header}"]\n${agents || '      empty((No agents registered))'}\n  end`;
    })
    .join('\n');
  const nodeBlock = state.nodes
    .map((node) => {
      const nodeId = sanitizeMermaidId(`node_${node.ensName}`);
      return `    ${nodeId}["${node.ensName}"]`;
    })
    .join('\n');
  const sentinelLinks =
    state.domains.length > 0
      ? state.domains
          .map((domain) => `  sentinel --> ${sanitizeMermaidId(`domain_${domain.id}`)};`)
          .join('\n')
      : '  sentinel --> nodesCluster;';
  return `flowchart TD\n  owner["🛡️ Owner Console"] --> gov["Governance\\ncommitteeSize: ${governance.committeeSize}\\nquorum: ${governance.quorumPercentage}%"];\n  owner --> sentinel["Sentinel\\nGrace ${Math.round(state.sentinelGraceRatio * 10000) / 100}%"];\n  owner --> nodesCluster;\n  subgraph validators["Validators"]\n${validatorNodes || '    placeholder((No active validators))'}\n  end\n  gov --> validators;\n${domainBlocks}\n  subgraph nodesCluster["Domain Nodes"]\n${nodeBlock || '    nodePlaceholder((No nodes))'}\n  end\n  validators --> sentinel;\n${sentinelLinks}`;
}

export function resetDomainsToDefault(state: OperatorState): void {
  const defaults = defaultDomains();
  state.domains = defaults.map((domain) => ({
    id: domain.id,
    humanName: domain.humanName,
    budgetLimit: domain.budgetLimit.toString(),
    unsafeOpcodes: Array.from(domain.unsafeOpcodes),
    paused: false,
  }));
}

