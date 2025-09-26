export type JobAction =
  | 'post_job'
  | 'finalize_job'
  | 'check_status'
  | 'stake'
  | 'dispute'
  | 'validate';

export interface AttachmentDescriptor {
  name: string;
  ipfs?: string;
  url?: string;
}

export interface JobPayload {
  title?: string;
  description?: string;
  rewardToken?: string;
  reward?: string;
  deadlineDays?: number;
  jobId?: number | string;
  attachments?: AttachmentDescriptor[];
  [key: string]: unknown;
}

export interface JobConstraints {
  maxFee?: string;
  privacy?: 'public' | 'private';
  [key: string]: unknown;
}

export interface UserContext {
  email?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface JobIntent {
  action: JobAction;
  payload: JobPayload;
  constraints?: JobConstraints;
  userContext?: UserContext;
}

export interface PlanResponse {
  summary: string;
  intent: JobIntent;
  requiresConfirmation: boolean;
  warnings: string[];
}

export interface ExecuteResponse {
  ok: boolean;
  jobId?: number | string;
  txHash?: string;
  receiptUrl?: string;
  error?: string;
}

export interface StatusResponse {
  ok: boolean;
  job?: {
    id: number | string;
    state: string;
    reward?: string;
    rewardToken?: string;
    deadline?: string;
    assignee?: string;
    metadataUri?: string;
  };
  error?: string;
}

export interface PlannerRequest {
  text: string;
  expert?: boolean;
}

export interface ExecuteRequest {
  intent: JobIntent;
  mode: 'relayer' | 'wallet';
}

export type StatusRequest =
  | { jobId: number | string }
  | { recent?: boolean };

export const ONEBOX_ENDPOINTS = {
  plan: '/onebox/plan',
  execute: '/onebox/execute',
  status: '/onebox/status',
} as const;

export type OneBoxEndpoint = (typeof ONEBOX_ENDPOINTS)[keyof typeof ONEBOX_ENDPOINTS];

export function buildReceiptUrl(baseExplorerUrl: string, txHash?: string): string | undefined {
  if (!txHash || !baseExplorerUrl) {
    return undefined;
  }
  const separator = baseExplorerUrl.endsWith('/') ? '' : '/';
  return `${baseExplorerUrl}${separator}tx/${txHash}`;
}
