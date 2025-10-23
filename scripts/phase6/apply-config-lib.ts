import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Contract } from 'ethers';
import { keccak256, toUtf8Bytes } from 'ethers';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export type GlobalConfigInput = {
  manifestURI: string;
  iotOracleRouter?: string;
  defaultL2Gateway?: string;
  didRegistry?: string;
  treasuryBridge?: string;
  l2SyncCadence?: number;
  systemPause?: string;
  escalationBridge?: string;
};

export type DomainConfigInput = {
  slug: string;
  name: string;
  manifestURI: string;
  subgraph: string;
  validationModule: string;
  oracle?: string;
  l2Gateway?: string;
  executionRouter?: string;
  heartbeatSeconds?: number;
  active?: boolean;
};

export type Phase6Config = {
  global: GlobalConfigInput;
  domains: DomainConfigInput[];
};

export type GlobalConfigStruct = {
  iotOracleRouter: string;
  defaultL2Gateway: string;
  didRegistry: string;
  treasuryBridge: string;
  l2SyncCadence: bigint;
  manifestURI: string;
};

export type DomainStruct = {
  slug: string;
  name: string;
  metadataURI: string;
  validationModule: string;
  dataOracle: string;
  l2Gateway: string;
  subgraphEndpoint: string;
  executionRouter: string;
  heartbeatSeconds: bigint;
  active: boolean;
};

export type ChainDomain = DomainStruct & {
  id: string;
};

export type Phase6State = {
  global: GlobalConfigStruct;
  systemPause: string;
  escalationBridge: string;
  domains: ChainDomain[];
};

export type GlobalPlan = {
  action: 'setGlobalConfig';
  config: GlobalConfigStruct;
  diffs: string[];
};

export type AddressPlan = {
  action: 'setSystemPause' | 'setEscalationBridge';
  target: string;
};

export type DomainPlan = {
  action: 'registerDomain' | 'updateDomain';
  id: string;
  slug: string;
  config: DomainStruct;
  diffs: string[];
};

export type Phase6Plan = {
  global?: GlobalPlan;
  systemPause?: AddressPlan;
  escalationBridge?: AddressPlan;
  domains: DomainPlan[];
  warnings: string[];
};

export function domainIdFromSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  return keccak256(toUtf8Bytes(normalized));
}

export function normalizeDomainView(view: any): ChainDomain {
  const config = view?.config ?? view?.[1] ?? view;
  const idRaw = view?.id ?? view?.[0];
  const slug = String(config?.slug ?? '');
  return {
    id: typeof idRaw === 'string' ? idRaw : String(idRaw ?? domainIdFromSlug(slug)),
    slug,
    name: String(config?.name ?? ''),
    metadataURI: String(config?.metadataURI ?? ''),
    validationModule: String(config?.validationModule ?? ZERO_ADDRESS),
    dataOracle: String(config?.dataOracle ?? ZERO_ADDRESS),
    l2Gateway: String(config?.l2Gateway ?? ZERO_ADDRESS),
    subgraphEndpoint: String(config?.subgraphEndpoint ?? ''),
    executionRouter: String(config?.executionRouter ?? ZERO_ADDRESS),
    heartbeatSeconds: BigInt(config?.heartbeatSeconds ?? 0),
    active: Boolean(config?.active ?? false),
  };
}

function eqAddress(a?: string | null, b?: string | null): boolean {
  const norm = (value?: string | null) => (value ? value.toLowerCase() : ZERO_ADDRESS);
  return norm(a) === norm(b);
}

function asBigInt(value?: number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  return 0n;
}

function buildDomainStruct(input: DomainConfigInput, currentActive?: boolean): DomainStruct {
  return {
    slug: input.slug,
    name: input.name,
    metadataURI: input.manifestURI,
    validationModule: input.validationModule,
    dataOracle: input.oracle ?? ZERO_ADDRESS,
    l2Gateway: input.l2Gateway ?? ZERO_ADDRESS,
    subgraphEndpoint: input.subgraph,
    executionRouter: input.executionRouter ?? ZERO_ADDRESS,
    heartbeatSeconds: BigInt(Math.trunc(input.heartbeatSeconds ?? 120)),
    active: input.active ?? currentActive ?? true,
  };
}

export function planPhase6Changes(current: Phase6State, desired: Phase6Config): Phase6Plan {
  const warnings: string[] = [];
  const domains: DomainPlan[] = [];

  const manifestURI = desired.global.manifestURI?.trim();
  if (!manifestURI) {
    throw new Error('Global manifestURI is required in the configuration.');
  }

  const targetGlobal: GlobalConfigStruct = {
    iotOracleRouter: desired.global.iotOracleRouter ?? ZERO_ADDRESS,
    defaultL2Gateway: desired.global.defaultL2Gateway ?? ZERO_ADDRESS,
    didRegistry: desired.global.didRegistry ?? ZERO_ADDRESS,
    treasuryBridge: desired.global.treasuryBridge ?? ZERO_ADDRESS,
    l2SyncCadence: BigInt(Math.trunc(desired.global.l2SyncCadence ?? Number(current.global.l2SyncCadence ?? 0n))),
    manifestURI,
  };

  const globalDiffs: string[] = [];
  if (!eqAddress(current.global.iotOracleRouter, targetGlobal.iotOracleRouter)) {
    globalDiffs.push('iotOracleRouter');
  }
  if (!eqAddress(current.global.defaultL2Gateway, targetGlobal.defaultL2Gateway)) {
    globalDiffs.push('defaultL2Gateway');
  }
  if (!eqAddress(current.global.didRegistry, targetGlobal.didRegistry)) {
    globalDiffs.push('didRegistry');
  }
  if (!eqAddress(current.global.treasuryBridge, targetGlobal.treasuryBridge)) {
    globalDiffs.push('treasuryBridge');
  }
  if (current.global.l2SyncCadence !== targetGlobal.l2SyncCadence) {
    globalDiffs.push('l2SyncCadence');
  }
  if ((current.global.manifestURI ?? '').trim() !== targetGlobal.manifestURI) {
    globalDiffs.push('manifestURI');
  }

  const plan: Phase6Plan = {
    domains,
    warnings,
  };

  if (globalDiffs.length > 0) {
    plan.global = {
      action: 'setGlobalConfig',
      config: targetGlobal,
      diffs: globalDiffs,
    };
  }

  const desiredPause = desired.global.systemPause;
  if (desiredPause) {
    if (!eqAddress(current.systemPause, desiredPause)) {
      plan.systemPause = {
        action: 'setSystemPause',
        target: desiredPause,
      };
    }
  } else {
    warnings.push('Configuration omits global.systemPause; owner review recommended.');
  }

  const desiredEscalation = desired.global.escalationBridge;
  if (desiredEscalation) {
    if (!eqAddress(current.escalationBridge, desiredEscalation)) {
      plan.escalationBridge = {
        action: 'setEscalationBridge',
        target: desiredEscalation,
      };
    }
  } else {
    warnings.push('Configuration omits global.escalationBridge; owner review recommended.');
  }

  const currentMap = new Map<string, ChainDomain>();
  for (const domain of current.domains) {
    currentMap.set(domain.slug.toLowerCase(), domain);
  }

  const desiredSlugs = new Set<string>();

  for (const input of desired.domains) {
    const slug = input.slug.trim();
    if (!slug) {
      warnings.push('Encountered domain with empty slug in configuration.');
      continue;
    }
    const key = slug.toLowerCase();
    desiredSlugs.add(key);
    const existing = currentMap.get(key);
    const struct = buildDomainStruct(input, existing?.active);
    if (!existing) {
      domains.push({
        action: 'registerDomain',
        id: domainIdFromSlug(slug),
        slug,
        config: struct,
        diffs: ['slug', 'metadataURI', 'validationModule', 'subgraphEndpoint', 'heartbeatSeconds'],
      });
      continue;
    }

    const diffs: string[] = [];
    if (existing.name !== struct.name) diffs.push('name');
    if (existing.metadataURI !== struct.metadataURI) diffs.push('metadataURI');
    if (!eqAddress(existing.validationModule, struct.validationModule)) diffs.push('validationModule');
    if (!eqAddress(existing.dataOracle, struct.dataOracle)) diffs.push('dataOracle');
    if (!eqAddress(existing.l2Gateway, struct.l2Gateway)) diffs.push('l2Gateway');
    if (existing.subgraphEndpoint !== struct.subgraphEndpoint) diffs.push('subgraphEndpoint');
    if (!eqAddress(existing.executionRouter, struct.executionRouter)) diffs.push('executionRouter');
    if (existing.heartbeatSeconds !== struct.heartbeatSeconds) diffs.push('heartbeatSeconds');
    if (existing.active !== struct.active) diffs.push('active');

    if (diffs.length > 0) {
      domains.push({
        action: 'updateDomain',
        id: existing.id,
        slug,
        config: struct,
        diffs,
      });
    }
  }

  for (const [slug, existing] of currentMap.entries()) {
    if (!desiredSlugs.has(slug)) {
      warnings.push(`On-chain domain ${existing.slug} (${existing.id}) missing from configuration.`);
    }
  }

  return plan;
}

export async function fetchPhase6State(manager: Contract): Promise<Phase6State> {
  const [globalRaw, systemPause, escalationBridge, domainViews] = await Promise.all([
    manager.globalConfig(),
    manager.systemPause(),
    manager.escalationBridge(),
    manager.listDomains(),
  ]);

  const global: GlobalConfigStruct = {
    iotOracleRouter: String(globalRaw.iotOracleRouter ?? globalRaw[0] ?? ZERO_ADDRESS),
    defaultL2Gateway: String(globalRaw.defaultL2Gateway ?? globalRaw[1] ?? ZERO_ADDRESS),
    didRegistry: String(globalRaw.didRegistry ?? globalRaw[2] ?? ZERO_ADDRESS),
    treasuryBridge: String(globalRaw.treasuryBridge ?? globalRaw[3] ?? ZERO_ADDRESS),
    l2SyncCadence: asBigInt(globalRaw.l2SyncCadence ?? globalRaw[4] ?? 0),
    manifestURI: String(globalRaw.manifestURI ?? globalRaw[5] ?? ''),
  };

  const domains = (domainViews as any[]).map((view) => normalizeDomainView(view));

  return {
    global,
    systemPause: String(systemPause ?? ZERO_ADDRESS),
    escalationBridge: String(escalationBridge ?? ZERO_ADDRESS),
    domains,
  };
}

export function loadPhase6Config(path: string): Phase6Config {
  const absolute = resolve(path);
  const raw = JSON.parse(readFileSync(absolute, 'utf-8'));
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid configuration file at ${absolute}`);
  }
  if (!raw.global || typeof raw.global !== 'object') {
    throw new Error('Configuration missing global section.');
  }
  if (!Array.isArray(raw.domains)) {
    throw new Error('Configuration missing domains array.');
  }
  return raw as Phase6Config;
}
