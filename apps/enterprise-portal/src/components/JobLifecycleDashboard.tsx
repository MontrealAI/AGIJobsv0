'use client';

import { formatUnits } from 'ethers';
import { useEffect, useMemo, useState } from 'react';
import { phaseToTagColor } from '../lib/jobStatus';
import type { JobSummary, JobTimelineEvent } from '../types';
import { formatDurationBetween } from '../lib/time';

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return '—';
  return new Date(timestamp * 1000).toLocaleString();
};

const formatReward = (value: bigint) => {
  try {
    return Number.parseFloat(formatUnits(value, 18)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  } catch (err) {
    return '0.00';
  }
};

const Timeline = ({ events }: { events: JobTimelineEvent[] }) => (
  <div className="timeline">
    {events.length === 0 && <div className="small">No activity yet.</div>}
    {events.map((event) => (
      <div className="timeline-item" key={event.id}>
        <div className={`tag ${phaseToTagColor(event.phase)}`} style={{ marginBottom: '0.5rem' }}>
          {event.phase}
        </div>
        <h4 style={{ marginBottom: '0.25rem' }}>{event.name}</h4>
        <div className="small">{formatTimestamp(event.timestamp)}</div>
        <p>{event.description}</p>
        {event.actor && <div className="small">Actor: {event.actor}</div>}
        {event.txHash && (
          <a className="small" href={`https://sepolia.etherscan.io/tx/${event.txHash}`} target="_blank" rel="noreferrer">
            View transaction
          </a>
        )}
      </div>
    ))}
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

  useEffect(() => {
    if (!selectedJobId && jobs.length > 0) {
      setSelectedJobId(jobs[0].jobId);
    }
  }, [jobs, selectedJobId]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.jobId === selectedJobId),
    [jobs, selectedJobId]
  );

  const selectedEvents = useMemo(
    () => events.filter((event) => (selectedJobId ? event.jobId === selectedJobId : false)),
    [events, selectedJobId]
  );

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
                  <td>{formatReward(job.reward)}</td>
                  <td>{job.agent ? `${job.agent.slice(0, 6)}…${job.agent.slice(-4)}` : '—'}</td>
                  <td>
                    <span className={`tag ${phaseToTagColor(job.phase)}`}>{job.phase}</span>
                  </td>
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
              <div className="data-grid">
                <div>
                  <div className="stat-label">Employer</div>
                  <div className="stat-value">{`${selectedJob.employer.slice(0, 6)}…${selectedJob.employer.slice(-4)}`}</div>
                </div>
                <div>
                  <div className="stat-label">Deadline</div>
                  <div className="stat-value">{formatTimestamp(selectedJob.deadline)}</div>
                </div>
                <div>
                  <div className="stat-label">Reward</div>
                  <div className="stat-value">{formatReward(selectedJob.reward)}</div>
                </div>
                <div>
                  <div className="stat-label">Stake</div>
                  <div className="stat-value">{formatReward(selectedJob.stake)}</div>
                </div>
              </div>
              <div className="alert">
                Validation countdown:{' '}
                {selectedJob.deadline > 0
                  ? formatDurationBetween(Math.floor(Date.now() / 1000), selectedJob.deadline)
                  : 'Unspecified'}
              </div>
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
