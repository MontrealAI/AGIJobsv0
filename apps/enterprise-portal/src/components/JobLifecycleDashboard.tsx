'use client';

import { formatUnits } from 'ethers';
import { useEffect, useMemo, useState } from 'react';
import { phaseToTagColor } from '../lib/jobStatus';
import type { JobSummary, JobTimelineEvent } from '../types';
import { formatDurationBetween } from '../lib/time';
import { portalConfig } from '../lib/contracts';

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return '—';
  return new Date(timestamp * 1000).toLocaleString();
};

const shortenAddress = (value?: string) => {
  if (!value) return '—';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const formatTokenAmount = (value: bigint) => {
  try {
    return Number.parseFloat(formatUnits(value, 18)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  } catch (err) {
    return value.toString();
  }
};

const formatTokenDisplay = (value?: bigint) => {
  if (typeof value === 'undefined') return '—';
  const amount = formatTokenAmount(value);
  const symbol = portalConfig.stakingTokenSymbol ?? '';
  return symbol ? `${amount} ${symbol}` : amount;
};

const safeDurationBetween = (from: number, to: number) => {
  try {
    return formatDurationBetween(from, to);
  } catch (err) {
    return undefined;
  }
};

const relativeTime = (timestamp: number | undefined, now: number): string | undefined => {
  if (!timestamp) return undefined;
  return safeDurationBetween(timestamp, now);
};

const Timeline = ({ events }: { events: JobTimelineEvent[] }) => (
  <div className="timeline">
    {events.length === 0 && <div className="small">No activity yet.</div>}
    {events.map((event) => {
      const args = event.meta?.args as Record<string, unknown> | undefined;
      const resultUri =
        typeof args?.resultURI === 'string'
          ? args.resultURI
          : Array.isArray(args)
            ? (args[3] as string | undefined)
            : undefined;
      return (
        <div className="timeline-item" key={event.id}>
          <div className={`tag ${phaseToTagColor(event.phase)}`} style={{ marginBottom: '0.5rem' }}>
            {event.phase}
          </div>
          <h4 style={{ marginBottom: '0.25rem' }}>{event.name}</h4>
          <div className="small">{formatTimestamp(event.timestamp)}</div>
          <p>{event.description}</p>
          {event.actor && <div className="small">Actor: {shortenAddress(event.actor)}</div>}
          {resultUri && (
            <a className="small" href={resultUri} target="_blank" rel="noreferrer">
              View deliverable
            </a>
          )}
          {event.txHash && (
            <a className="small" href={`https://sepolia.etherscan.io/tx/${event.txHash}`} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </div>
      );
    })}
  </div>
);

interface Props {
  jobs: JobSummary[];
  events: JobTimelineEvent[];
  loading: boolean;
  error?: string;
}

export const JobLifecycleDashboard = ({ jobs, events, loading, error }: Props) => {
  const [selectedJobId, setSelectedJobId] = useState<bigint>();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!selectedJobId && jobs.length > 0) {
      setSelectedJobId(jobs[0].jobId);
    }
  }, [jobs, selectedJobId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.jobId === selectedJobId),
    [jobs, selectedJobId]
  );

  const selectedEvents = useMemo(
    () => events.filter((event) => (selectedJobId ? event.jobId === selectedJobId : false)),
    [events, selectedJobId]
  );

  const validationCountdown = useMemo(() => {
    if (!selectedJob) return undefined;
    const target = selectedJob.validationEndsAt ?? selectedJob.deadline;
    if (!target) return undefined;
    return safeDurationBetween(now, target);
  }, [now, selectedJob]);

  const statusBanner = useMemo(() => {
    if (!selectedJob) return undefined;
    const validatorProgress = selectedJob.totalValidators
      ? `${selectedJob.validatorVotes ?? 0} of ${selectedJob.totalValidators} votes`
      : undefined;
    const agentLabel = shortenAddress(selectedJob.agent);
    const createdRelative = relativeTime(selectedJob.createdAt ?? selectedJob.lastUpdated, now);
    const submittedRelative = relativeTime(selectedJob.resultSubmittedAt, now);
    const validationRelative = relativeTime(selectedJob.validationStartedAt, now);

    switch (selectedJob.phase) {
      case 'Created':
        return {
          message: `Job posted${createdRelative ? ` ${createdRelative}` : ''}. Awaiting agent assignment.`,
          variant: 'alert'
        } as const;
      case 'Assigned':
        return {
          message: `Assigned to ${agentLabel}. Deliverable due by ${formatTimestamp(selectedJob.deadline)}.`,
          variant: 'alert'
        } as const;
      case 'Submitted':
        return {
          message: `Deliverable submitted${submittedRelative ? ` ${submittedRelative}` : ''}. Awaiting validator review.`,
          variant: 'alert'
        } as const;
      case 'InValidation':
        return {
          message: `In validation${validationRelative ? ` since ${validationRelative}` : ''} — ${
            validatorProgress ?? 'awaiting committee formation'
          }${validationCountdown ? `. Decision window closes ${validationCountdown}.` : ''}`,
          variant: 'alert'
        } as const;
      case 'Finalized':
        return {
          message: `Job finalized on ${formatTimestamp(selectedJob.lastUpdated)}. Payouts settled and certificates issued.`,
          variant: 'alert success'
        } as const;
      case 'Disputed':
        return {
          message: `Dispute raised${validationRelative ? ` ${validationRelative}` : ''}. Monitor validator votes and SLA evidence.`,
          variant: 'alert error'
        } as const;
      case 'Cancelled':
      case 'Expired':
        return {
          message: `Job is no longer active. Last update ${formatTimestamp(selectedJob.lastUpdated)}.`,
          variant: 'alert error'
        } as const;
      default:
        return undefined;
    }
  }, [now, selectedJob, validationCountdown]);

  return (
    <section>
      <div className="card-title">
        <div>
          <h2>Job Lifecycle Monitoring</h2>
          <p>Observe real-time status, validator checkpoints, and dispute signals across your enterprise job portfolio.</p>
        </div>
        <div className={`tag ${selectedJob ? phaseToTagColor(selectedJob.phase) : 'purple'}`}>
          {selectedJob ? selectedJob.phase : 'Waiting'}
        </div>
      </div>
      {loading && <div className="small">Loading job data…</div>}
      {error && <div className="alert error">{error}</div>}
      <div className="grid two-column" style={{ marginTop: '1.5rem' }}>
        <div>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Reward</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Validators</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.jobId.toString()}
                  onClick={() => setSelectedJobId(job.jobId)}
                  style={{ cursor: 'pointer', backgroundColor: selectedJobId === job.jobId ? 'rgba(124,136,255,0.12)' : undefined }}
                >
                  <td>#{job.jobId.toString()}</td>
                  <td>{formatTokenDisplay(job.reward)}</td>
                  <td>{shortenAddress(job.agent)}</td>
                  <td>
                    <span className={`tag ${phaseToTagColor(job.phase)}`}>{job.phase}</span>
                  </td>
                  <td>{job.totalValidators ? `${job.validatorVotes ?? 0}/${job.totalValidators}` : '—'}</td>
                  <td>{formatTimestamp(job.lastUpdated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {jobs.length === 0 && !loading && <div className="small">No jobs posted yet. Create one to activate monitoring.</div>}
        </div>
        <div>
          {selectedJob ? (
            <div className="grid">
              {statusBanner && <div className={statusBanner.variant}>{statusBanner.message}</div>}
              <div className="data-grid">
                <div>
                  <div className="stat-label">Employer</div>
                  <div className="stat-value">{shortenAddress(selectedJob.employer)}</div>
                </div>
                <div>
                  <div className="stat-label">Deadline</div>
                  <div className="stat-value">{formatTimestamp(selectedJob.deadline)}</div>
                </div>
                <div>
                  <div className="stat-label">Reward</div>
                  <div className="stat-value">{formatTokenDisplay(selectedJob.reward)}</div>
                </div>
                <div>
                  <div className="stat-label">Agent Stake</div>
                  <div className="stat-value">{formatTokenDisplay(selectedJob.stake)}</div>
                </div>
                <div>
                  <div className="stat-label">Validator Votes</div>
                  <div className="stat-value">
                    {selectedJob.totalValidators ? `${selectedJob.validatorVotes ?? 0}/${selectedJob.totalValidators}` : '—'}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Validator Stake</div>
                  <div className="stat-value">{formatTokenDisplay(selectedJob.stakedByValidators)}</div>
                </div>
              </div>
              <div className="alert">
                Validation countdown: {validationCountdown ?? 'Unspecified'}
              </div>
              <div className="code-block">
                <strong>Specification</strong>
                <div>Hash: {selectedJob.specHash}</div>
                {selectedJob.uri && (
                  <div>
                    URI:{' '}
                    <a href={selectedJob.uri} target="_blank" rel="noreferrer">
                      {selectedJob.uri}
                    </a>
                  </div>
                )}
              </div>
              {selectedJob.resultUri && (
                <div className="code-block">
                  <strong>Latest deliverable</strong>
                  {selectedJob.resultHash && <div>Result hash: {selectedJob.resultHash}</div>}
                  <div>
                    URI:{' '}
                    <a href={selectedJob.resultUri} target="_blank" rel="noreferrer">
                      {selectedJob.resultUri}
                    </a>
                  </div>
                  {selectedJob.resultSubmittedAt && (
                    <div className="small" style={{ marginTop: '0.5rem' }}>
                      Submitted {relativeTime(selectedJob.resultSubmittedAt, now) ?? 'recently'}
                    </div>
                  )}
                </div>
              )}
              <Timeline events={selectedEvents} />
            </div>
          ) : (
            <div className="small">Select a job to view timeline details.</div>
          )}
        </div>
      </div>
    </section>
  );
};
