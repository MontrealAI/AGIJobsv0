import * as fs from 'fs';
import * as path from 'path';

const configPath = path.join(__dirname, '..', 'config', 'agialpha.json');
const { address, decimals } = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { address: string; decimals: number };

// Canonical $AGIALPHA token address on Ethereum mainnet.
export const AGIALPHA = address;

// Standard decimals for $AGIALPHA.
export const AGIALPHA_DECIMALS = decimals;
