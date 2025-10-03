'use client';

import { useMemo, useState } from 'react';
import { formatUnits } from 'ethers';
import type { JobSummary } from '../types';
import { useTranslation } from '../context/LanguageContext';
import { portalConfig } from '../lib/contracts';

interface Props {
  jobs: JobSummary[];
  loading: boolean;
  error?: string;
}

type ResponseState = 'accepted' | 'declined';

const formatReward = (value: bigint): string => {
  try {
    const formatted = Number.parseFloat(formatUnits(value, 18));
    return formatted.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return value.toString();
  }
};

const localeMap: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  zh: 'zh-CN',
  ja: 'ja-JP',
};

const formatDeadline = (timestamp?: number, locale = 'en'): string => {
  if (!timestamp) return '—';
  const milliseconds = timestamp * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return '—';
  const resolvedLocale = localeMap[locale] ?? locale;
  return new Intl.DateTimeFormat(resolvedLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export const AgentInbox = ({ jobs, loading, error }: Props) => {
  const { t, locale } = useTranslation();
  const [responses, setResponses] = useState<Record<string, ResponseState>>({});
  const [feedback, setFeedback] = useState<string>();

  const availableJobs = useMemo(
    () =>
      jobs.filter((job) => job.phase === 'Created' || job.phase === 'Assigned'),
    [jobs]
  );

  const handleRespond = (jobId: bigint, status: ResponseState) => {
    const key = jobId.toString();
    setResponses((prev) => ({ ...prev, [key]: status }));
    const statusText =
      status === 'accepted'
        ? t('agentInbox.accepted')
        : t('agentInbox.declined');
    setFeedback(t('agentInbox.responded', { status: statusText, id: key }));
  };

  return (
    <section className="inbox-panel">
      <div className="card-title">
        <div>
          <h2>{t('agentInbox.title')}</h2>
          <p>{t('agentInbox.subtitle')}</p>
        </div>
        <div className="tag green">Agent</div>
      </div>
      {loading && <div className="small">{t('common.loading')}</div>}
      {error && (
        <div className="alert error">
          {t('common.error', { message: error })}
        </div>
      )}
      {feedback && <div className="alert info">{feedback}</div>}
      {availableJobs.length === 0 && !loading ? (
        <div className="empty-state">{t('agentInbox.empty')}</div>
      ) : (
        <ul className="job-feed">
          {availableJobs.map((job) => {
            const rewardDisplay = `${formatReward(job.reward)}${
              portalConfig.stakingTokenSymbol
                ? ` ${portalConfig.stakingTokenSymbol}`
                : ''
            }`;
            const deadline = job.deadline
              ? formatDeadline(job.deadline, locale)
              : t('chat.summary.deadlineUnset');
            const responseKey = job.jobId.toString();
            const responded = responses[responseKey];
            const typeLabel = (() => {
              switch (job.agentTypes) {
                case 1:
                  return t('chat.agentTypeOptions.generalist');
                case 3:
                  return t('chat.agentTypeOptions.hybrid');
                case 7:
                  return t('chat.agentTypeOptions.multi');
                default:
                  return typeof job.agentTypes === 'number'
                    ? job.agentTypes.toString()
                    : '—';
              }
            })();
            return (
              <li key={responseKey} className="job-feed__item">
                <div className="job-feed__meta">
                  <h3>#{job.jobId.toString()}</h3>
                  <p className="chat-meta">{job.phase}</p>
                </div>
                <dl className="job-feed__details">
                  <div>
                    <dt>{t('agentInbox.reward')}</dt>
                    <dd>{rewardDisplay}</dd>
                  </div>
                  <div>
                    <dt>{t('agentInbox.deadline')}</dt>
                    <dd>{deadline}</dd>
                  </div>
                  <div>
                    <dt>{t('agentInbox.agentTypes')}</dt>
                    <dd>{typeLabel}</dd>
                  </div>
                </dl>
                <div className="job-feed__actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => handleRespond(job.jobId, 'accepted')}
                    disabled={Boolean(responded)}
                  >
                    {responded === 'accepted'
                      ? t('agentInbox.accepted')
                      : t('agentInbox.accept')}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleRespond(job.jobId, 'declined')}
                    disabled={Boolean(responded)}
                  >
                    {responded === 'declined'
                      ? t('agentInbox.declined')
                      : t('agentInbox.decline')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
