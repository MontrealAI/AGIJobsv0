'use client';

import { formatUnits } from 'ethers';
import { useMemo } from 'react';
import { portalConfig } from '../lib/contracts';
import type { ValidatorInsight } from '../types';

type ValidatorPanelStatus = 'pending' | 'selected' | 'committed' | 'revealed';

interface DerivedInsight extends ValidatorInsight {
  status: ValidatorPanelStatus;
  lastTimestamp?: number;
}

const deriveValidatorInsights = (records: ValidatorInsight[]): DerivedInsight[] => {
  const deduped = new Map<string, DerivedInsight>();
  for (const record of records) {
    const key = `${record.jobId.toString()}:${record.validator.toLowerCase()}`;
    const status: ValidatorPanelStatus = record.revealedAt
      ? 'revealed'
      : record.committedAt
        ? 'committed'
        : record.selectedAt
          ? 'selected'
          : 'pending';
    const lastTimestamp = record.revealedAt ?? record.committedAt ?? record.selectedAt;
    const existing = deduped.get(key);
    if (!existing || (lastTimestamp ?? 0) > (existing.lastTimestamp ?? 0)) {
      deduped.set(key, {
        ...record,
        status,
        lastTimestamp
      });
    } else if (existing && typeof existing.stake === 'undefined' && typeof record.stake === 'bigint') {
      deduped.set(key, {
        ...existing,
        stake: record.stake
      });
    }
  }
  return Array.from(deduped.values()).sort((a, b) => {
    const timeA = a.lastTimestamp ?? 0;
    const timeB = b.lastTimestamp ?? 0;
    if (timeA !== timeB) return timeB - timeA;
    if (a.jobId !== b.jobId) return Number(b.jobId - a.jobId);
    return a.validator.localeCompare(b.validator);
  });
};

const formatStake = (stake?: bigint) => {
  if (typeof stake !== 'bigint') return '—';
  try {
    const formatted = Number.parseFloat(formatUnits(stake, 18)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${formatted} ${portalConfig.stakingTokenSymbol ?? 'STAKE'}`;
  } catch (err) {
    return `${stake.toString()} wei`;
  }
};

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return '—';
  return new Date(timestamp * 1000).toLocaleString();
};

const formatStatus = (status: ValidatorPanelStatus) => {
  switch (status) {
    case 'revealed':
      return { label: 'Reveal submitted', className: 'tag green' };
    case 'committed':
      return { label: 'Commit posted', className: 'tag purple' };
    case 'selected':
      return { label: 'Selected', className: 'tag orange' };
    default:
      return { label: 'Pending selection', className: 'tag purple' };
  }
};

const formatVote = (vote?: ValidatorInsight['vote']) => {
  if (!vote) return { label: '—', className: 'tag purple' };
  if (vote === 'approve') return { label: 'APPROVE', className: 'tag green' };
  if (vote === 'reject') return { label: 'REJECT', className: 'tag red' };
  return { label: 'TIMEOUT', className: 'tag orange' };
};

interface Props {
  validators: ValidatorInsight[];
  loading: boolean;
  hasValidationModule: boolean;
}

export const ValidatorLogPanel = ({ validators, loading, hasValidationModule }: Props) => {
  const insights = useMemo(() => deriveValidatorInsights(validators), [validators]);
  const hasCommitteeData = insights.length > 0;

  return (
    <section>
      <div className="card-title">
        <div>
          <h2>Validator Committee Activity</h2>
          <p>Commit / reveal lifecycle, stakes, and vote outcomes sourced from on-chain committee signals.</p>
        </div>
        <div className="tag orange">Validation</div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Validator</th>
            <th>Stake</th>
            <th>Status</th>
            <th>Vote</th>
            <th>Last update</th>
          </tr>
        </thead>
        <tbody>
          {insights.map((insight) => {
            const statusTag = formatStatus(insight.status);
            const voteTag = formatVote(insight.vote);
            return (
              <tr key={`${insight.jobId.toString()}:${insight.validator}`}>
                <td>#{insight.jobId.toString()}</td>
                <td>{`${insight.validator.slice(0, 6)}…${insight.validator.slice(-4)}`}</td>
                <td>{formatStake(insight.stake)}</td>
                <td>
                  <span className={statusTag.className}>{statusTag.label}</span>
                </td>
                <td>
                  <span className={voteTag.className}>{voteTag.label}</span>
                </td>
                <td>{formatTimestamp(insight.lastTimestamp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!hasCommitteeData && !loading && (
        <div className="small">No validator committee information available yet.</div>
      )}
      {!hasValidationModule && (
        <div className="alert" style={{ marginTop: '1rem' }}>
          Validation module address is not configured for this deployment. Committee membership is derived from JobRegistry
          snapshots only, so commit / reveal activity may be unavailable.
        </div>
      )}
      {hasValidationModule && (
        <div className="alert" style={{ marginTop: '1rem' }}>
          Committee insights combine <code>JobRegistry.getJobValidators</code> responses with ValidationModule commit and reveal
          logs. Entries update automatically as validators act on-chain.
        </div>
      )}
    </section>
  );
};
