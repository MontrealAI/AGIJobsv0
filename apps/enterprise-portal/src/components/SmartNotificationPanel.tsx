'use client';

import { useMemo } from 'react';
import type { JobSummary } from '../types';
import { useTranslation } from '../context/LanguageContext';
import { portalConfig } from '../lib/contracts';

interface Props {
  jobs: JobSummary[];
}

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0h';
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

export const NotificationPanel = ({ jobs }: Props) => {
  const { t } = useTranslation();

  const tips = useMemo(() => {
    const entries: string[] = [];
    const now = Math.floor(Date.now() / 1000);
    const idleJob = jobs.find((job) => {
      const reference = job.createdAt ?? job.lastUpdated;
      if (!reference) return false;
      return job.phase === 'Created' && now - reference > 36 * 3600;
    });
    if (idleJob) {
      const reference = idleJob.createdAt ?? idleJob.lastUpdated ?? now;
      entries.push(
        t('notifications.idleJob', {
          id: idleJob.jobId.toString(),
          duration: formatDuration(now - reference),
        })
      );
    }

    if (jobs.length === 0) {
      entries.push(t('notifications.noJobs'));
    } else if (portalConfig.stakingTokenSymbol) {
      entries.push(
        t('notifications.increaseStake', {
          amount: '500',
          symbol: portalConfig.stakingTokenSymbol,
        })
      );
    }

    entries.push(t('notifications.validatorReminder'));
    return entries;
  }, [jobs, t]);

  return (
    <section className="notification-panel">
      <div className="card-title">
        <div>
          <h2>{t('notifications.title')}</h2>
        </div>
        <div className="tag teal">Tips</div>
      </div>
      <ul className="notification-list">
        {tips.map((tip, index) => (
          <li key={index}>{tip}</li>
        ))}
      </ul>
    </section>
  );
};
