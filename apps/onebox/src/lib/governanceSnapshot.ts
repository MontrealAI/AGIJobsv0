'use client';

export interface GovernanceSnapshotResponse {
  timestamp?: string;
  chainId?: number | string;
  onChain?: Record<string, unknown> | null;
  configs?: Record<string, unknown> | null;
}

export interface OwnerTelemetryMetric {
  label: string;
  value: string;
}

export interface OwnerTelemetryCard {
  id: string;
  title: string;
  caption?: string;
  metrics: OwnerTelemetryMetric[];
  footnote?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getRecord = (
  container: Record<string, unknown> | undefined,
  key: string
): Record<string, unknown> | undefined => {
  if (!container) {
    return undefined;
  }
  const candidate = container[key];
  if (!isRecord(candidate)) {
    return undefined;
  }
  return candidate;
};

const readString = (
  record: Record<string, unknown> | undefined,
  key: string
): string | undefined => {
  if (!record) {
    return undefined;
  }
  const value = record[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const labelOrValue = (
  record: Record<string, unknown> | undefined,
  labelKey: string,
  valueKey?: string
): string | undefined => {
  const label = readString(record, labelKey);
  if (label) {
    return label;
  }
  if (!valueKey) {
    return undefined;
  }
  return readString(record, valueKey);
};

const appendMetric = (
  metrics: OwnerTelemetryMetric[],
  label: string,
  value: string | undefined
) => {
  if (!value) {
    return;
  }
  metrics.push({ label, value });
};

const buildAddressFootnote = (
  descriptor: string,
  address: string | undefined
): string | undefined => {
  if (!address) {
    return undefined;
  }
  return `${descriptor} ${address}`;
};

export const buildOwnerTelemetryCards = (
  snapshot: GovernanceSnapshotResponse | null | undefined
): OwnerTelemetryCard[] => {
  if (!snapshot || !isRecord(snapshot)) {
    return [];
  }

  const onChain = isRecord(snapshot.onChain) ? snapshot.onChain : undefined;
  const configs = isRecord(snapshot.configs) ? snapshot.configs : undefined;

  const jobRegistry = getRecord(onChain, 'jobRegistry');
  const stakeManager = getRecord(onChain, 'stakeManager');
  const feePool = getRecord(onChain, 'feePool');
  const identityRegistry =
    getRecord(onChain, 'identityRegistry') ??
    getRecord(configs, 'identity');

  const cards: OwnerTelemetryCard[] = [];

  if (jobRegistry) {
    const metrics: OwnerTelemetryMetric[] = [];
    appendMetric(
      metrics,
      'Max job reward',
      labelOrValue(jobRegistry, 'maxJobRewardLabel', 'maxJobReward')
    );
    appendMetric(
      metrics,
      'Mandatory stake',
      labelOrValue(jobRegistry, 'jobStakeLabel', 'jobStake')
    );
    appendMetric(
      metrics,
      'Max duration',
      labelOrValue(jobRegistry, 'maxJobDurationLabel', 'maxJobDuration')
    );
    appendMetric(
      metrics,
      'Validator reward %',
      labelOrValue(
        jobRegistry,
        'validatorRewardPctLabel',
        'validatorRewardPct'
      )
    );
    appendMetric(
      metrics,
      'Protocol fee %',
      labelOrValue(jobRegistry, 'feePctLabel', 'feePct')
    );

    if (metrics.length > 0) {
      cards.push({
        id: 'job-policy',
        title: 'Job policy guardrails',
        caption:
          'Escrow, validator incentives, and lifecycle limits enforced by the registry.',
        metrics,
        footnote: buildAddressFootnote(
          'Registry contract',
          readString(jobRegistry, 'address')
        ),
      });
    }
  }

  if (stakeManager) {
    const metrics: OwnerTelemetryMetric[] = [];
    appendMetric(
      metrics,
      'Minimum validator stake',
      labelOrValue(stakeManager, 'minStakeLabel', 'minStake')
    );
    appendMetric(
      metrics,
      'Validator reward %',
      labelOrValue(
        stakeManager,
        'validatorRewardPctLabel',
        'validatorRewardPct'
      )
    );
    appendMetric(
      metrics,
      'Protocol fee %',
      labelOrValue(stakeManager, 'feePctLabel', 'feePct')
    );
    appendMetric(
      metrics,
      'Burn %',
      labelOrValue(stakeManager, 'burnPctLabel', 'burnPct')
    );
    appendMetric(
      metrics,
      'Treasury',
      readString(stakeManager, 'treasury')
    );

    if (metrics.length > 0) {
      cards.push({
        id: 'stake-manager',
        title: 'Stake enforcement',
        caption: 'Validator staking economics controlled by the owner surface.',
        metrics,
        footnote: buildAddressFootnote(
          'Stake manager',
          readString(stakeManager, 'address')
        ),
      });
    }
  }

  if (feePool) {
    const metrics: OwnerTelemetryMetric[] = [];
    appendMetric(
      metrics,
      'Burn %',
      labelOrValue(feePool, 'burnPctLabel', 'burnPct')
    );
    appendMetric(
      metrics,
      'Treasury',
      readString(feePool, 'treasury')
    );

    if (metrics.length > 0) {
      cards.push({
        id: 'fee-pool',
        title: 'Protocol treasury routing',
        caption: 'Fee distribution rules governed by the owner playbooks.',
        metrics,
        footnote: buildAddressFootnote(
          'Fee pool',
          readString(feePool, 'address')
        ),
      });
    }
  }

  if (identityRegistry) {
    const metrics: OwnerTelemetryMetric[] = [];
    appendMetric(
      metrics,
      'Agent ENS root',
      readString(identityRegistry, 'agentRootNode')
    );
    appendMetric(
      metrics,
      'Club ENS root',
      readString(identityRegistry, 'clubRootNode')
    );
    appendMetric(
      metrics,
      'Agent Merkle root',
      readString(identityRegistry, 'agentMerkleRoot')
    );
    appendMetric(
      metrics,
      'Validator Merkle root',
      readString(identityRegistry, 'validatorMerkleRoot')
    );
    appendMetric(
      metrics,
      'ENS registry',
      readString(identityRegistry, 'ens')
    );
    appendMetric(
      metrics,
      'Name wrapper',
      readString(identityRegistry, 'nameWrapper')
    );

    if (metrics.length > 0) {
      cards.push({
        id: 'identity-registry',
        title: 'Identity governance',
        caption:
          'Names, membership proofs, and validator rosters anchored to owner-controlled registries.',
        metrics,
        footnote: buildAddressFootnote(
          'Identity registry',
          readString(identityRegistry, 'address')
        ),
      });
    }
  }

  return cards;
};

