import * as fs from 'fs';
import * as path from 'path';

const configPath = path.join(__dirname, '..', 'config', 'agialpha.json');
const constantsPath = path.join(__dirname, '..', 'contracts', 'v2', 'Constants.sol');

// Read JSON config
const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
  address: string;
  decimals: number;
};

// Read Solidity constants
const constantsSrc = fs.readFileSync(constantsPath, 'utf8');
const addrMatch = constantsSrc.match(/address constant AGIALPHA = (0x[0-9a-fA-F]{40});/);
const decMatch = constantsSrc.match(/uint8 constant AGIALPHA_DECIMALS = (\d+);/);

if (!addrMatch || !decMatch) {
  throw new Error('Failed to parse Constants.sol');
}

const solAddress = addrMatch[1];
const solDecimals = parseInt(decMatch[1], 10);

if (config.address.toLowerCase() !== solAddress.toLowerCase()) {
  console.error(`Address mismatch: config ${config.address} vs contract ${solAddress}`);
  process.exit(1);
}

if (config.decimals !== solDecimals) {
  console.error(`Decimals mismatch: config ${config.decimals} vs contract ${solDecimals}`);
  process.exit(1);
}

console.log('AGIALPHA address and decimals match.');

