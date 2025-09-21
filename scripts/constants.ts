import { loadTokenConfig } from './config';

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
