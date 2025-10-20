import { strict as assert } from 'node:assert';

export interface TimelineEntry {
  kind: string;
  label: string;
  at: string;
  scenario?: string;
  meta?: Record<string, unknown>;
}

export interface ScenarioEntry {
  title: string;
  jobId: string;
  timelineIndices: number[];
}

export interface OwnerActionEntry {
  label: string;
  contract: string;
  method: string;
  at: string;
  parameters?: Record<string, unknown>;
}

export interface MintedCertificate {
  jobId: string;
  owner?: string;
  uri?: string;
}

export interface AgentPortfolio {
  name: string;
  address: string;
  certificates: MintedCertificate[];
}

export interface ValidatorPortfolio {
  name: string;
  address: string;
}

export interface MarketSnapshot {
  totalJobs: string;
  totalBurned: string;
  finalSupply: string;
  feePct: number;
  validatorRewardPct: number;
  pendingFees: string;
  totalAgentStake: string;
  totalValidatorStake: string;
  mintedCertificates: MintedCertificate[];
  agentPortfolios: AgentPortfolio[];
  validatorCouncil: ValidatorPortfolio[];
}

export interface OwnerControlSnapshot {
  ownerAddress: string;
  moderatorAddress: string;
  baseline: Record<string, unknown>;
  upgraded: Record<string, unknown>;
  restored: Record<string, unknown>;
  pauseDrill: {
    owner: PauseMatrix;
    moderator: PauseMatrix;
  };
  controlMatrix: ControlMatrixEntry[];
  drillCompletedAt: string;
}

interface PauseMatrix {
  registry: boolean;
  stake: boolean;
  validation: boolean;
}

interface ControlMatrixEntry {
  module: string;
  address: string;
  delegatedTo: string;
  capabilities: unknown[];
  status: string;
}

export interface AutomationSnapshot {
  unstoppableScore: number;
  commands: Record<string, string>;
}

export interface NationalSupplyChainTranscript {
  generatedAt: string;
  network: string;
  actors: unknown[];
  ownerActions: OwnerActionEntry[];
  timeline: TimelineEntry[];
  scenarios: ScenarioEntry[];
  market: MarketSnapshot;
  ownerControl: OwnerControlSnapshot;
  insights: unknown[];
  automation: AutomationSnapshot;
}

export interface TranscriptValidationSummary {
  timelineLength: number;
  ownerActions: number;
  scenarioCount: number;
  unstoppableScore: number;
  mintedCertificates: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureRecord<T extends Record<string, unknown>>(value: unknown, message: string): T {
  if (!isRecord(value)) {
    throw new Error(message);
  }
  return value as T;
}

function ensureArray<T>(value: unknown, message: string): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(message);
  }
  return value as T[];
}

function ensureString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(message);
  }
  return value;
}

function ensureNumber(value: unknown, message: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(message);
  }
  return value;
}

function ensureBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(message);
  }
  return value;
}

export function validateTranscript(transcript: unknown): TranscriptValidationSummary {
  const root = ensureRecord<Partial<NationalSupplyChainTranscript>>(transcript, 'Transcript root must be an object.');

  ensureString(root.generatedAt, 'generatedAt timestamp missing.');
  ensureString(root.network, 'network metadata missing.');
  ensureArray(root.actors, 'actors roster missing or empty.');

  const ownerActions = ensureArray<unknown>(root.ownerActions, 'ownerActions must be a populated array.').map((entry, index) => {
    const record = ensureRecord<OwnerActionEntry>(entry, `ownerActions[${index}] must be an object.`);
    ensureString(record.label, `ownerActions[${index}] is missing label.`);
    ensureString(record.contract, `ownerActions[${index}] is missing contract.`);
    ensureString(record.method, `ownerActions[${index}] is missing method.`);
    ensureString(record.at, `ownerActions[${index}] is missing timestamp.`);
    if (record.parameters !== undefined) {
      ensureRecord(record.parameters, `ownerActions[${index}].parameters must be an object when present.`);
    }
    return record;
  });

  if (ownerActions.length < 40) {
    throw new Error(`Insufficient owner actions recorded (${ownerActions.length}); demo must highlight sovereign control.`);
  }

  const timeline = ensureArray<unknown>(root.timeline, 'timeline must be a populated array.').map((entry, index) => {
    const record = ensureRecord<TimelineEntry>(entry, `timeline[${index}] must be an object.`);
    const { kind } = record;
    ensureString(kind, `timeline[${index}] is missing kind.`);
    ensureString(record.label, `timeline[${index}] is missing label.`);
    ensureString(record.at, `timeline[${index}] is missing timestamp.`);

    const allowedKinds = new Set([
      'section',
      'step',
      'job-summary',
      'balance',
      'owner-action',
      'summary',
      'insight',
    ]);
    if (!allowedKinds.has(kind)) {
      throw new Error(`timeline[${index}] has unexpected kind "${kind}".`);
    }

    if (record.scenario !== undefined) {
      ensureString(record.scenario, `timeline[${index}].scenario must be a non-empty string when provided.`);
    }
    if (record.meta !== undefined) {
      ensureRecord(record.meta, `timeline[${index}].meta must be an object when provided.`);
    }
    return record;
  });

  if (timeline.length < 150) {
    throw new Error(`Timeline too short (${timeline.length}); expect richly narrated coordination.`);
  }

  const timelineOwnerActions = timeline.filter((entry) => entry.kind === 'owner-action').length;
  if (timelineOwnerActions < 20) {
    throw new Error('Timeline must contain at least 20 owner-action events to demonstrate unstoppable governance.');
  }

  const scenarios = ensureArray<unknown>(root.scenarios, 'scenarios must be a populated array.').map((entry, index) => {
    const record = ensureRecord<ScenarioEntry>(entry, `scenarios[${index}] must be an object.`);
    const title = ensureString(record.title, `scenarios[${index}] missing title.`);
    const jobId = ensureString(record.jobId, `scenarios[${index}] missing jobId.`);
    const indices = ensureArray<number>(record.timelineIndices, `scenarios[${index}] missing timelineIndices.`);
    if (indices.length < 5) {
      throw new Error(`scenarios[${index}] should reference at least five timeline events.`);
    }
    for (const idx of indices) {
      if (typeof idx !== 'number' || !Number.isInteger(idx)) {
        throw new Error(`scenarios[${index}] timeline index must be an integer.`);
      }
      if (idx < 0 || idx >= timeline.length) {
        throw new Error(`scenarios[${index}] timeline index ${idx} out of bounds.`);
      }
      const entryAtIndex = timeline[idx];
      if (entryAtIndex.scenario && entryAtIndex.scenario !== title) {
        throw new Error(`timeline[${idx}] scenario label mismatch; expected ${title}.`);
      }
    }
    return record;
  });

  if (scenarios.length < 3) {
    throw new Error(`Expected at least three scenarios but found ${scenarios.length}.`);
  }

  const scenarioJobIds = new Set(scenarios.map((scenario) => scenario.jobId));

  const market = ensureRecord<MarketSnapshot>(root.market, 'market snapshot missing.');
  ensureString(market.totalJobs, 'market.totalJobs missing.');
  ensureString(market.totalBurned, 'market.totalBurned missing.');
  ensureString(market.finalSupply, 'market.finalSupply missing.');
  ensureNumber(market.feePct, 'market.feePct missing.');
  ensureNumber(market.validatorRewardPct, 'market.validatorRewardPct missing.');
  ensureString(market.pendingFees, 'market.pendingFees missing.');
  ensureString(market.totalAgentStake, 'market.totalAgentStake missing.');
  ensureString(market.totalValidatorStake, 'market.totalValidatorStake missing.');

  const mintedCertificates = ensureArray<unknown>(market.mintedCertificates, 'market.mintedCertificates missing or empty.').map(
    (entry, index) => {
      const record = ensureRecord<MintedCertificate>(entry, `market.mintedCertificates[${index}] must be an object.`);
      const jobId = ensureString(record.jobId, `market.mintedCertificates[${index}] missing jobId.`);
      if (!scenarioJobIds.has(jobId)) {
        throw new Error(`market.mintedCertificates[${index}] references unknown jobId ${jobId}.`);
      }
      if (record.owner !== undefined) {
        ensureString(record.owner, `market.mintedCertificates[${index}].owner must be a string when provided.`);
      }
      if (record.uri !== undefined) {
        ensureString(record.uri, `market.mintedCertificates[${index}].uri must be a string when provided.`);
      }
      return record;
    }
  );

  if (mintedCertificates.length < 2) {
    throw new Error('At least two minted certificates are required to prove mission graduation.');
  }

  const agentPortfolios = ensureArray<unknown>(market.agentPortfolios, 'market.agentPortfolios missing or empty.').map(
    (entry, index) => {
      const record = ensureRecord<AgentPortfolio>(entry, `market.agentPortfolios[${index}] must be an object.`);
      ensureString(record.name, `market.agentPortfolios[${index}] missing name.`);
      ensureString(record.address, `market.agentPortfolios[${index}] missing address.`);
      ensureArray(record.certificates, `market.agentPortfolios[${index}] requires certificates array.`);
      return record;
    }
  );
  if (agentPortfolios.length < 2) {
    throw new Error('Need at least two agent portfolios to showcase national-scale orchestration.');
  }

  const validatorCouncil = ensureArray<unknown>(market.validatorCouncil, 'market.validatorCouncil missing or empty.').map(
    (entry, index) => {
      const record = ensureRecord<ValidatorPortfolio>(entry, `market.validatorCouncil[${index}] must be an object.`);
      ensureString(record.name, `market.validatorCouncil[${index}] missing name.`);
      ensureString(record.address, `market.validatorCouncil[${index}] missing address.`);
      return record;
    }
  );
  if (validatorCouncil.length < 3) {
    throw new Error('Validator council must contain at least three members.');
  }

  const ownerControl = ensureRecord<OwnerControlSnapshot>(root.ownerControl, 'ownerControl snapshot missing.');
  ensureString(ownerControl.ownerAddress, 'ownerControl.ownerAddress missing.');
  ensureString(ownerControl.moderatorAddress, 'ownerControl.moderatorAddress missing.');
  ensureRecord(ownerControl.baseline, 'ownerControl.baseline missing.');
  ensureRecord(ownerControl.upgraded, 'ownerControl.upgraded missing.');
  ensureRecord(ownerControl.restored, 'ownerControl.restored missing.');
  ensureString(ownerControl.drillCompletedAt, 'ownerControl.drillCompletedAt missing.');

  const pauseOwner = ensureRecord(ownerControl.pauseDrill.owner, 'ownerControl.pauseDrill.owner missing.');
  ensureBoolean(pauseOwner.registry, 'ownerControl.pauseDrill.owner.registry must be boolean.');
  ensureBoolean(pauseOwner.stake, 'ownerControl.pauseDrill.owner.stake must be boolean.');
  ensureBoolean(pauseOwner.validation, 'ownerControl.pauseDrill.owner.validation must be boolean.');

  const pauseModerator = ensureRecord(ownerControl.pauseDrill.moderator, 'ownerControl.pauseDrill.moderator missing.');
  ensureBoolean(pauseModerator.registry, 'ownerControl.pauseDrill.moderator.registry must be boolean.');
  ensureBoolean(pauseModerator.stake, 'ownerControl.pauseDrill.moderator.stake must be boolean.');
  ensureBoolean(pauseModerator.validation, 'ownerControl.pauseDrill.moderator.validation must be boolean.');

  const controlMatrix = ensureArray<unknown>(ownerControl.controlMatrix, 'ownerControl.controlMatrix missing or empty.').map(
    (entry, index) => {
      const record = ensureRecord<ControlMatrixEntry>(entry, `ownerControl.controlMatrix[${index}] must be an object.`);
      ensureString(record.module, `ownerControl.controlMatrix[${index}] missing module name.`);
      ensureString(record.address, `ownerControl.controlMatrix[${index}] missing contract address.`);
      ensureString(record.delegatedTo, `ownerControl.controlMatrix[${index}] missing delegatedTo.`);
      ensureArray(record.capabilities, `ownerControl.controlMatrix[${index}] requires capabilities list.`);
      ensureString(record.status, `ownerControl.controlMatrix[${index}] missing status.`);
      return record;
    }
  );
  if (controlMatrix.length < 6) {
    throw new Error('ownerControl.controlMatrix must include all core modules.');
  }

  const automation = ensureRecord<AutomationSnapshot>(root.automation, 'automation snapshot missing.');
  const unstoppableScore = ensureNumber(automation.unstoppableScore, 'automation.unstoppableScore missing.');
  if (unstoppableScore < 95) {
    throw new Error(`Unstoppable score too low (${unstoppableScore}); demo must prove unstoppable execution.`);
  }
  const commands = ensureRecord<Record<string, string>>(automation.commands, 'automation.commands missing.');
  const requiredCommands = [
    'replayDemo',
    'exportTranscript',
    'launchControlRoom',
  ];
  for (const command of requiredCommands) {
    ensureString(commands[command], `automation.commands missing ${command}.`);
  }

  assert(Array.isArray(root.insights), 'insights must be present to narrate the mission.');
  if ((root.insights?.length ?? 0) < 5) {
    throw new Error('insights array must contain at least five strategic findings.');
  }

  return {
    timelineLength: timeline.length,
    ownerActions: ownerActions.length,
    scenarioCount: scenarios.length,
    unstoppableScore,
    mintedCertificates: mintedCertificates.length,
  };
}
