/**
 * Shared data contracts between the AGI Jobs one-box UI and the orchestrator service.
 * These types intentionally match the FastAPI schemas exposed under `/onebox/*`.
 */

/** Allowed high-level actions emitted by the planner. */
export type JobAction =
  | 'post_job'
  | 'finalize_job'
  | 'check_status'
  | 'stake'
  | 'validate'
  | 'dispute'
  | 'apply_job'
  | 'submit_work'
  | 'withdraw'
  | 'admin_set';

/** File attachment metadata for job descriptions stored on IPFS. */
export interface JobAttachment {
  name: string;
  /** IPFS hash (CID) of the uploaded asset. */
  ipfs?: string;
  /** Optional MIME type or descriptive label. */
  type?: string;
  /** Optional HTTP gateway URL for previews. */
  url?: string;
}

/** Structured description of a job action produced by the planner. */
export interface JobIntent {
  action: JobAction;
  payload: Record<string, unknown> & {
    jobId?: number | string;
    title?: string;
    description?: string;
    reward?: string | number;
    rewardToken?: string;
    deadlineDays?: number;
    attachments?: JobAttachment[];
    agentTypes?: number;
  };
  constraints?: Record<string, unknown> & {
    maxFee?: string;
    privacy?: 'public' | 'private';
  };
  userContext?: Record<string, unknown> & {
    sessionId?: string;
    email?: string;
  };
}

/** Response returned by `/onebox/plan`. */
export interface PlanResponse {
  summary: string;
  intent: JobIntent;
  requiresConfirmation?: boolean;
  warnings?: string[];
}

/** Response returned by `/onebox/execute`. */
export interface ExecuteResponse {
  ok: boolean;
  jobId?: number;
  txHash?: string;
  receiptUrl?: string;
  specCid?: string;
  specHash?: string;
  deadline?: number;
  reward?: string;
  token?: string;
  status?: string;
  /** Target address for wallet execution flows. */
  to?: string;
  /** ABI-encoded calldata for wallet execution flows. */
  data?: string;
  /** Hex-encoded value (in wei) to send with the transaction. */
  value?: string;
  /** Target chain id for the prepared transaction. */
  chainId?: number;
  error?: string;
}

/** Shape returned by `/onebox/status`. */
export interface StatusResponse {
  jobs: JobStatusCard[];
  nextToken?: string;
}

export interface JobStatusCard {
  jobId: number;
  title?: string;
  status: string;
  statusLabel?: string;
  reward?: string;
  rewardToken?: string;
  deadline?: string;
  assignee?: string;
}

export interface PlanRequest {
  text: string;
  expert?: boolean;
}

export interface ExecuteRequest {
  intent: JobIntent;
  mode: 'relayer' | 'wallet';
}
