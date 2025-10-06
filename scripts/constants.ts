import { loadTokenConfig } from './config';
import { PROTOCOL_DEFAULTS } from './generated/protocol-defaults';

const {
  config: { address, decimals, symbol, name },
} = loadTokenConfig();

// Canonical $AGIALPHA token address on Ethereum mainnet.
export const AGIALPHA = address;

// Standard decimals for $AGIALPHA.
export const AGIALPHA_DECIMALS = decimals;

// ERC-20 symbol for $AGIALPHA.
export const AGIALPHA_SYMBOL = symbol;

// ERC-20 name for $AGIALPHA.
export const AGIALPHA_NAME = name;

export const PROTOCOL_FEE_PCT_POINTS = PROTOCOL_DEFAULTS.feePct;
export const PROTOCOL_FEE_PCT = PROTOCOL_FEE_PCT_POINTS / 100;
export const PROTOCOL_FEE_PCT_PERCENT = PROTOCOL_DEFAULTS.feePctPercent;
export const PROTOCOL_FEE_PCT_BASIS_POINTS =
  PROTOCOL_DEFAULTS.feePctBasisPoints;

export const PROTOCOL_BURN_PCT_POINTS = PROTOCOL_DEFAULTS.burnPct;
export const PROTOCOL_BURN_PCT = PROTOCOL_BURN_PCT_POINTS / 100;
export const PROTOCOL_BURN_PCT_PERCENT = PROTOCOL_DEFAULTS.burnPctPercent;
export const PROTOCOL_BURN_PCT_BASIS_POINTS =
  PROTOCOL_DEFAULTS.burnPctBasisPoints;

export const PROTOCOL_TREASURY = PROTOCOL_DEFAULTS.treasury;
export const PROTOCOL_VALIDATORS_PER_JOB =
  PROTOCOL_DEFAULTS.validatorsPerJob;
export const PROTOCOL_REQUIRED_APPROVALS =
  PROTOCOL_DEFAULTS.requiredApprovals;
export const PROTOCOL_COMMIT_WINDOW_SECONDS =
  PROTOCOL_DEFAULTS.commitWindowSeconds;
export const PROTOCOL_COMMIT_WINDOW = PROTOCOL_COMMIT_WINDOW_SECONDS;
export const PROTOCOL_REVEAL_WINDOW_SECONDS =
  PROTOCOL_DEFAULTS.revealWindowSeconds;
export const PROTOCOL_REVEAL_WINDOW = PROTOCOL_REVEAL_WINDOW_SECONDS;
