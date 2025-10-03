'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import type { JobTimelineEvent, ValidatorInsight } from '../types';
import { useTranslation } from '../context/LanguageContext';
import { resolveResourceUri } from '../lib/uri';

interface Props {
  events: JobTimelineEvent[];
  validators: ValidatorInsight[];
  loading: boolean;
  hasValidationModule: boolean;
}

type ReviewDecision = 'approve' | 'reject';

interface DecisionState {
  decision?: ReviewDecision;
  comment: string;
}

const getResultUri = (event: JobTimelineEvent): string | undefined => {
  const args = event.meta?.args as Record<string, unknown> | undefined;
  if (!args) return undefined;
  if (typeof args.resultURI === 'string') return args.resultURI;
  if (Array.isArray(args)) {
    const candidate = args[3];
    return typeof candidate === 'string' ? candidate : undefined;
  }
  return undefined;
};

export const ValidatorConsole = ({
  events,
  validators,
  loading,
  hasValidationModule,
}: Props) => {
  const { t } = useTranslation();
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>({});

  const reviewQueue = useMemo(
    () =>
      events.filter(
        (event) =>
          event.name === 'ResultSubmitted' || event.phase === 'Submitted'
      ),
    [events]
  );

  const handleDecision = (jobId: bigint, decision: ReviewDecision) => {
    const key = jobId.toString();
    setDecisions((prev) => ({
      ...prev,
      [key]: {
        decision,
        comment: prev[key]?.comment ?? '',
      },
    }));
  };

  const handleCommentChange = (
    jobId: bigint,
    event: ChangeEvent<HTMLTextAreaElement>
  ) => {
    const key = jobId.toString();
    const value = event.target.value;
    setDecisions((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        comment: value,
      },
    }));
  };

  const renderValidatorBadge = (jobId: bigint) => {
    const insight = validators.find((entry) => entry.jobId === jobId);
    if (!insight?.vote) return null;
    const label =
      insight.vote === 'approve'
        ? t('validator.badge.approve')
        : t('validator.badge.reject');
    return (
      <span className={`tag ${insight.vote === 'approve' ? 'green' : 'red'}`}>
        {label}
      </span>
    );
  };

  return (
    <section className="validator-panel">
      <div className="card-title">
        <div>
          <h2>{t('validator.title')}</h2>
          <p>{t('validator.subtitle')}</p>
        </div>
        <div className="tag orange">Validator</div>
      </div>
      {!hasValidationModule && (
        <div className="alert warning">{t('validator.unavailable')}</div>
      )}
      {loading && <div className="small">{t('common.loading')}</div>}
      {reviewQueue.length === 0 && hasValidationModule && !loading ? (
        <div className="empty-state">{t('validator.empty')}</div>
      ) : (
        <ul className="review-list">
          {reviewQueue.map((event) => {
            const key = `${event.jobId.toString()}-${event.id}`;
            const decision = decisions[event.jobId.toString()];
            const resolvedUri =
              resolveResourceUri(getResultUri(event) ?? '') ??
              getResultUri(event);
            return (
              <li key={key} className="review-card">
                <div className="review-card__header">
                  <h3>
                    #{event.jobId.toString()} · {event.name}
                  </h3>
                  {renderValidatorBadge(event.jobId)}
                </div>
                <p className="chat-meta">{event.description}</p>
                <div className="review-card__meta">
                  <span>
                    {t('validator.submittedAt')}:{' '}
                    {event.timestamp
                      ? new Date(event.timestamp * 1000).toLocaleString()
                      : '—'}
                  </span>
                  {resolvedUri && (
                    <a
                      className="chat-link"
                      href={resolvedUri}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('validator.resultLink')}
                    </a>
                  )}
                </div>
                <textarea
                  className="review-card__comment"
                  value={decision?.comment ?? ''}
                  onChange={(evt) => handleCommentChange(event.jobId, evt)}
                  placeholder={t('validator.commentPlaceholder')}
                  rows={3}
                />
                <div className="review-card__actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => handleDecision(event.jobId, 'approve')}
                  >
                    {t('validator.approve')}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleDecision(event.jobId, 'reject')}
                  >
                    {t('validator.reject')}
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
