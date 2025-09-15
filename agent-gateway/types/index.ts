export interface Job {
  jobId: string;
  employer: string;
  agent: string;
  rewardRaw: string;
  reward: string;
  stakeRaw: string;
  stake: string;
  feeRaw: string;
  fee: string;
  specHash?: string;
  uri?: string;
}

import type { WebSocket } from 'ws';

export interface AgentInfo {
  url?: string;
  wallet: string;
  ws: WebSocket | null;
}

export interface CommitData {
  approve: boolean;
  salt: string;
}
