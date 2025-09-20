import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';

const defaultConfigPath = path.join(__dirname, '..', 'config', 'agialpha.json');
const defaultConstantsPath = path.join(
  __dirname,
  '..',
  'contracts',
  'v2',
  'Constants.sol'
);

type TokenConfig = {
  address: string;
  decimals: number;
  burnAddress: string;
};

function assertAddress(
  value: string,
  label: string,
  { allowZero = false }: { allowZero?: boolean } = {}
): string {
  if (!value || typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`${label} must be a valid Ethereum address`);
  }
  const normalised = ethers.getAddress(value);
  if (!allowZero && normalised === ethers.ZeroAddress) {
    throw new Error(`${label} cannot be the zero address`);
  }
  return normalised;
}

function assertDecimals(value: number, label: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  if (value < 0 || value > 255) {
    throw new Error(`${label} must be between 0 and 255`);
  }
  return value;
}

function parseConstants(constantsSrc: string) {
  const addrMatch = constantsSrc.match(
    /address constant AGIALPHA = (0x[0-9a-fA-F]{40});/
  );
  const decMatch = constantsSrc.match(
    /uint8 constant AGIALPHA_DECIMALS = (\d+);/
  );
  const burnMatch = constantsSrc.match(
    /address constant BURN_ADDRESS = (0x[0-9a-fA-F]{40});/
  );

  if (!addrMatch || !decMatch || !burnMatch) {
    throw new Error('Failed to parse Constants.sol');
  }

  return {
    address: addrMatch[1],
    decimals: parseInt(decMatch[1], 10),
    burnAddress: burnMatch[1],
  };
}

export function verifyAgialpha(
  configPath: string = defaultConfigPath,
  constantsPath: string = defaultConstantsPath
): void {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as TokenConfig;
  const constantsSrc = fs.readFileSync(constantsPath, 'utf8');
  const constants = parseConstants(constantsSrc);

  const configAddress = assertAddress(config.address, 'Config AGIALPHA address');
  const constantsAddress = assertAddress(
    constants.address,
    'Constants AGIALPHA address'
  );
  const configBurn = assertAddress(config.burnAddress, 'Config burn address', {
    allowZero: true,
  });
  const constantsBurn = assertAddress(
    constants.burnAddress,
    'Constants burn address',
    { allowZero: true }
  );
  const configDecimals = assertDecimals(
    config.decimals,
    'Config decimals'
  );
  const constantsDecimals = assertDecimals(
    constants.decimals,
    'Constants decimals'
  );

  if (configAddress !== constantsAddress) {
    throw new Error(
      `Address mismatch: config ${configAddress} vs contract ${constantsAddress}`
    );
  }

  if (configDecimals !== constantsDecimals) {
    throw new Error(
      `Decimals mismatch: config ${configDecimals} vs contract ${constantsDecimals}`
    );
  }

  if (configBurn !== constantsBurn) {
    throw new Error(
      `Burn address mismatch: config ${configBurn} vs contract ${constantsBurn}`
    );
  }
}

if (require.main === module) {
  try {
    verifyAgialpha();
    console.log('AGIALPHA address, decimals, and burn address match.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
}
