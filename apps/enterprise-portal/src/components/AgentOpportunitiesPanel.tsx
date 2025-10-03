'use client';

import { useState } from 'react';
import type { JobSummary } from '../types';
import { useLocalization } from '../context/LocalizationContext';
import { formatUnits } from 'ethers';

interface AgentOpportunitiesPanelProps {
  jobs: JobSummary[];
  loading: boolean;
  error?: string;
}

const formatReward = (reward: bigint) => {
  try {
    return formatUnits(reward, 18);
  } catch (err) {
    return reward.toString();
  }
};

export const AgentOpportunitiesPanel = ({ jobs, loading, error }: AgentOpportunitiesPanelProps) => {
  const { t } = useLocalization();
  const [acceptedJob, setAcceptedJob] = useState<bigint>();
  const [dismissedJobs, setDismissedJobs] = useState<bigint[]>([]);

  const availableJobs = jobs.filter((job) => !dismissedJobs.includes(job.jobId));

  const handleAccept = (jobId: bigint) => {
    setAcceptedJob(jobId);
  };

  const handleDecline = (jobId: bigint) => {
    setDismissedJobs((prev) => [...prev, jobId]);
  };

  return (
    <section>
      <div className="card-title">
        <div>
          <h3>{t('agent.title')}</h3>
          <p>{t('agent.subtitle')}</p>
        </div>
      </div>
      {loading && <div className="status">{t('status.loading')}</div>}
      {error && <div className="alert error">{error}</div>}
      {!loading && availableJobs.length === 0 && <div className="status">{t('agent.empty')}</div>}
      <div className="opportunity-feed">
        {availableJobs.map((job) => (
          <article key={job.jobId.toString()} className={`opportunity-card ${acceptedJob === job.jobId ? 'accepted' : ''}`}>
            <header>
              <h4>#{job.jobId.toString()}</h4>
              <span className="tag green">{t('agent.reward')}: {formatReward(job.reward)}</span>
            </header>
            <dl>
              <div>
                <dt>{t('agent.deadline')}</dt>
                <dd>{job.deadline ? new Date(job.deadline * 1000).toLocaleString() : t('employer.summary.none')}</dd>
              </div>
              <div>
                <dt>{t('employer.summary.skills')}</dt>
                <dd>{job.specUri ?? job.specHash}</dd>
              </div>
            </dl>
            <footer>
              <button className="primary" onClick={() => handleAccept(job.jobId)}>
                {t('agent.accept')}
              </button>
              <button className="secondary" onClick={() => handleDecline(job.jobId)}>
                {t('agent.decline')}
              </button>
            </footer>
          </article>
        ))}
      </div>
      {acceptedJob && <div className="alert success">{t('employer.status.success')}</div>}
    </section>
  );
};
