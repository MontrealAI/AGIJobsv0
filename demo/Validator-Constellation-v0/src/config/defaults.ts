import { defaultAllowlist, defaultAllowlistFingerprint } from "../identity/allowlist";
import type { Domain } from "./entities";

export interface GovernanceParameters {
  readonly quorum: number;
  readonly committeeSize: number;
  readonly commitDeadlineSeconds: number;
  readonly revealDeadlineSeconds: number;
  readonly nonRevealSlashBps: number;
  readonly dishonestSlashBps: number;
  readonly sentinelPauseSlaSeconds: number;
}

export const governanceDefaults: GovernanceParameters = {
  quorum: 4,
  committeeSize: 5,
  commitDeadlineSeconds: 90,
  revealDeadlineSeconds: 120,
  nonRevealSlashBps: 250, // 2.5%
  dishonestSlashBps: 600, // 6%
  sentinelPauseSlaSeconds: 6,
};

export const domainBudgets: Record<Domain, bigint> = {
  "deep-research": 5_000n * 10n ** 18n,
  "defi-risk": 4_400n * 10n ** 18n,
  infrastructure: 6_800n * 10n ** 18n,
  "bio-safety": 3_200n * 10n ** 18n,
};

export const allowlistSnapshot = defaultAllowlist;
export const allowlistFingerprint = defaultAllowlistFingerprint;
