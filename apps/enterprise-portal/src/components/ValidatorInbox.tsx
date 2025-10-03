'use client';

import { useState } from 'react';
import type { JobTimelineEvent } from '../types';
import { useLocalization } from '../context/LocalizationContext';

interface ValidatorInboxProps {
  events: JobTimelineEvent[];
  loading: boolean;
}

interface ReviewState {
  decision?: 'approve' | 'reject';
  comment: string;
}

const toLocaleString = (timestamp: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

export const ValidatorInbox = ({ events, loading }: ValidatorInboxProps) => {
  const { t } = useLocalization();
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});

  const submissions = events.filter((event) => event.name === 'ResultSubmitted');

  const handleDecision = (jobId: string, decision: 'approve' | 'reject') => {
    setReviews((prev) => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        decision
      }
    }));
  };

  const handleCommentChange = (jobId: string, comment: string) => {
    setReviews((prev) => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        comment
      }
    }));
  };

  return (
    <section>
      <div className="card-title">
        <div>
          <h3>{t('validator.title')}</h3>
          <p>{t('validator.subtitle')}</p>
        </div>
      </div>
      {loading && <div className="status">{t('status.loading')}</div>}
      {!loading && submissions.length === 0 && <div className="status">{t('validator.empty')}</div>}
      <div className="validator-queue">
        {submissions.map((submission) => {
          const jobId = submission.jobId.toString();
          const review = reviews[jobId] ?? { comment: '' };
          const args = submission.meta?.args as Record<string, unknown> | undefined;
          const resultUri =
            (args?.resultURI as string | undefined) ??
            (Array.isArray(args) ? ((args[3] as string | undefined) ?? '') : '') ??
            submission.meta?.resultUri;

          return (
            <article key={jobId} className="validator-card">
              <header>
                <h4>#{jobId}</h4>
                <span className="tag orange">{toLocaleString(submission.timestamp)}</span>
              </header>
              <p>{submission.description}</p>
              {resultUri && (
                <p>
                  <strong>{t('validator.result')}:</strong>{' '}
                  <a href={resultUri} target="_blank" rel="noreferrer">
                    {resultUri}
                  </a>
                </p>
              )}
              <div className="validator-actions">
                <button
                  className={review.decision === 'approve' ? 'primary' : 'secondary'}
                  type="button"
                  onClick={() => handleDecision(jobId, 'approve')}
                >
                  {t('validator.approve')}
                </button>
                <button
                  className={review.decision === 'reject' ? 'primary' : 'secondary'}
                  type="button"
                  onClick={() => handleDecision(jobId, 'reject')}
                >
                  {t('validator.reject')}
                </button>
              </div>
              <label className="sr-only" htmlFor={`validator-comment-${jobId}`}>
                {t('validator.comment')}
              </label>
              <textarea
                id={`validator-comment-${jobId}`}
                value={review.comment}
                placeholder={t('validator.comment')}
                onChange={(event) => handleCommentChange(jobId, event.target.value)}
                rows={3}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
};
