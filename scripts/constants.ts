import * as fs from 'fs';
import * as path from 'path';

const configPath = path.join(__dirname, '..', 'config', 'agialpha.json');
const { address, decimals, symbol, name } = JSON.parse(
  fs.readFileSync(configPath, 'utf8')
) as { address: string; decimals: number; symbol: string; name: string };

// Canonical $AGIALPHA token address on Ethereum mainnet.
export const AGIALPHA = address;

// Standard decimals for $AGIALPHA.
export const AGIALPHA_DECIMALS = decimals;

// ERC-20 symbol for $AGIALPHA.
export const AGIALPHA_SYMBOL = symbol;

// ERC-20 name for $AGIALPHA.
export const AGIALPHA_NAME = name;
