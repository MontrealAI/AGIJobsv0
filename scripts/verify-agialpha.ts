import * as fs from 'fs';
import * as path from 'path';

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

function normaliseAddress(addr: string): string {
  return addr.toLowerCase();
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

  if (
    normaliseAddress(config.address) !== normaliseAddress(constants.address)
  ) {
    throw new Error(
      `Address mismatch: config ${config.address} vs contract ${constants.address}`
    );
  }

  if (config.decimals !== constants.decimals) {
    throw new Error(
      `Decimals mismatch: config ${config.decimals} vs contract ${constants.decimals}`
    );
  }

  if (
    normaliseAddress(config.burnAddress) !==
    normaliseAddress(constants.burnAddress)
  ) {
    throw new Error(
      `Burn address mismatch: config ${config.burnAddress} vs contract ${constants.burnAddress}`
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
