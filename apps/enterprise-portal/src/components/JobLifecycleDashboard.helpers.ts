import type { JobSummary } from '../types';
import { formatDurationBetween } from '../lib/time.js';

export const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return '—';
  return new Date(timestamp * 1000).toLocaleString();
};

export const shortenAddress = (value?: string) => {
  if (!value) return '—';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

export const safeDurationBetween = (from: number, to: number) => {
  try {
    return formatDurationBetween(from, to);
  } catch {
    return undefined;
  }
};

export const relativeTime = (
  timestamp: number | undefined,
  now: number
): string | undefined => {
  if (!timestamp) return undefined;
  return safeDurationBetween(timestamp, now);
};

export interface StatusBanner {
  message: string;
  variant: 'alert' | 'alert success' | 'alert error';
}

export const deriveStatusBanner = ({
  job,
  now,
  validationCountdown,
}: {
  job: JobSummary;
  now: number;
  validationCountdown?: string;
}): StatusBanner | undefined => {
  const validatorProgress = job.totalValidators
    ? `${job.validatorVotes ?? 0} of ${job.totalValidators} votes`
    : undefined;
  const agentLabel = shortenAddress(job.agent);
  const createdRelative = relativeTime(job.createdAt ?? job.lastUpdated, now);
  const submittedRelative = relativeTime(job.resultSubmittedAt, now);
  const validationRelative = relativeTime(job.validationStartedAt, now);
  const validatedRelative = relativeTime(job.lastUpdated, now);

  switch (job.phase) {
    case 'Created':
      return {
        message: `Job posted${createdRelative ? ` ${createdRelative}` : ''}. Awaiting agent assignment.`,
        variant: 'alert',
      } as const;
    case 'Assigned':
      return {
        message: `Assigned to ${agentLabel}. Deliverable due by ${formatTimestamp(job.deadline)}.`,
        variant: 'alert',
      } as const;
    case 'Submitted':
      return {
        message: `Deliverable submitted${
          submittedRelative ? ` ${submittedRelative}` : ''
        }. Awaiting validator review.`,
        variant: 'alert',
      } as const;
    case 'InValidation':
      return {
        message: `In validation${
          validationRelative ? ` since ${validationRelative}` : ''
        } — ${validatorProgress ?? 'awaiting committee formation'}${
          validationCountdown
            ? `. Decision window closes ${validationCountdown}.`
            : ''
        }`,
        variant: 'alert',
      } as const;
    case 'Validated': {
      const outcomeText =
        job.success === false
          ? 'Outcome rejected. Awaiting finalization or dispute.'
          : 'Outcome approved. Awaiting finalization.';
      return {
        message: `Validation completed${
          validatedRelative ? ` ${validatedRelative}` : ''
        }. ${outcomeText}`,
        variant: job.success === false ? 'alert error' : 'alert success',
      } as const;
    }
    case 'Finalized':
      return {
        message: `Job finalized on ${formatTimestamp(
          job.lastUpdated
        )}. Payouts settled and certificates issued.`,
        variant: 'alert success',
      } as const;
    case 'Disputed':
      return {
        message: `Dispute raised${
          validationRelative ? ` ${validationRelative}` : ''
        }. Monitor validator votes and SLA evidence.`,
        variant: 'alert error',
      } as const;
    case 'Cancelled':
    case 'Expired':
      return {
        message: `Job is no longer active. Last update ${formatTimestamp(
          job.lastUpdated
        )}.`,
        variant: 'alert error',
      } as const;
    default:
      return undefined;
  }
};
