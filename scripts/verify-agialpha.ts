import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { loadTokenConfig, inferNetworkKey } from './config';

const { path: defaultConfigPath } = loadTokenConfig();
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
  symbol: string;
  name: string;
};

type TokenMetadata = {
  decimals: number;
  symbol: string;
  name: string;
};

type VerifyOptions = {
  rpcUrl?: string;
  provider?: ethers.Provider;
  timeoutMs?: number;
  skipOnChain?: boolean;
  fetchMetadata?: (
    provider: ethers.Provider,
    address: string
  ) => Promise<TokenMetadata>;
};

type VerifyResult = {
  onChainVerified: boolean;
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

function parseStringConstant(
  source: string,
  pattern: RegExp,
  label: string
): string {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Failed to parse ${label} from Constants.sol`);
  }
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    throw new Error(`Unable to decode ${label}: ${(err as Error).message}`);
  }
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

  const symbol = parseStringConstant(
    constantsSrc,
    /string constant AGIALPHA_SYMBOL = (".*?");/,
    'AGIALPHA symbol'
  );
  const name = parseStringConstant(
    constantsSrc,
    /string constant AGIALPHA_NAME = (".*?");/,
    'AGIALPHA name'
  );

  return {
    address: addrMatch[1],
    decimals: parseInt(decMatch[1], 10),
    burnAddress: burnMatch[1],
    symbol,
    name,
  };
}

const ERC20_INTERFACE = new ethers.Interface([
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]);

async function fetchTokenMetadata(
  provider: ethers.Provider,
  address: string
): Promise<TokenMetadata> {
  const decimalsData = await provider.call({
    to: address,
    data: ERC20_INTERFACE.encodeFunctionData('decimals'),
  });
  const symbolData = await provider.call({
    to: address,
    data: ERC20_INTERFACE.encodeFunctionData('symbol'),
  });
  const nameData = await provider.call({
    to: address,
    data: ERC20_INTERFACE.encodeFunctionData('name'),
  });

  const [decimalsRaw] = ERC20_INTERFACE.decodeFunctionResult(
    'decimals',
    decimalsData
  );
  const [symbolRaw] = ERC20_INTERFACE.decodeFunctionResult(
    'symbol',
    symbolData
  );
  const [nameRaw] = ERC20_INTERFACE.decodeFunctionResult('name', nameData);

  return {
    decimals: Number(decimalsRaw),
    symbol: String(symbolRaw),
    name: String(nameRaw),
  };
}

function ensureTimeout(timeoutMs?: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs === undefined) {
    return 15_000;
  }
  if (timeoutMs <= 0) {
    throw new Error('Timeout must be greater than zero milliseconds');
  }
  return Math.floor(timeoutMs);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function resolveRpcUrl(options: VerifyOptions): string | undefined {
  if (options.rpcUrl) {
    return options.rpcUrl;
  }
  if (typeof process !== 'undefined') {
    return process.env.VERIFY_RPC_URL || process.env.RPC_URL;
  }
  return undefined;
}

function normaliseMetadataValue(value: string): string {
  return value.trim();
}

export async function verifyAgialpha(
  configPath: string = defaultConfigPath,
  constantsPath: string = defaultConstantsPath,
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as TokenConfig;
  const constantsSrc = fs.readFileSync(constantsPath, 'utf8');
  const constants = parseConstants(constantsSrc);

  const configAddress = assertAddress(
    config.address,
    'Config AGIALPHA address'
  );
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
  const configDecimals = assertDecimals(config.decimals, 'Config decimals');
  const constantsDecimals = assertDecimals(
    constants.decimals,
    'Constants decimals'
  );
  const configSymbol = config.symbol?.trim();
  const constantsSymbol = constants.symbol?.trim();
  const configName = config.name?.trim();
  const constantsName = constants.name?.trim();

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

  if (!configSymbol || !constantsSymbol) {
    throw new Error('AGIALPHA symbol missing from config or constants');
  }
  if (configSymbol !== constantsSymbol) {
    throw new Error(
      `Symbol mismatch: config ${configSymbol} vs contract ${constantsSymbol}`
    );
  }

  if (!configName || !constantsName) {
    throw new Error('AGIALPHA name missing from config or constants');
  }
  if (configName !== constantsName) {
    throw new Error(
      `Name mismatch: config ${configName} vs contract ${constantsName}`
    );
  }

  const skipOnChain = Boolean(options.skipOnChain);
  const fetcher = options.fetchMetadata ?? fetchTokenMetadata;
  const rpcUrl = resolveRpcUrl(options);
  const provider =
    options.provider ?? (rpcUrl ? new ethers.JsonRpcProvider(rpcUrl) : null);

  if (skipOnChain || !provider) {
    return { onChainVerified: false };
  }

  const timeout = ensureTimeout(options.timeoutMs);
  const metadata = await withTimeout(
    fetcher(provider, configAddress),
    timeout,
    'AGIALPHA metadata query'
  );

  const chainDecimals = Number(metadata.decimals);
  const chainSymbol = normaliseMetadataValue(String(metadata.symbol ?? ''));
  const chainName = normaliseMetadataValue(String(metadata.name ?? ''));

  if (Number.isNaN(chainDecimals)) {
    throw new Error('On-chain decimals result is not a valid number');
  }

  if (chainDecimals !== configDecimals) {
    throw new Error(
      `On-chain decimals mismatch: config ${configDecimals} vs chain ${chainDecimals}`
    );
  }

  if (chainSymbol !== configSymbol) {
    throw new Error(
      `On-chain symbol mismatch: config ${configSymbol} vs chain ${chainSymbol}`
    );
  }

  if (chainName !== configName) {
    throw new Error(
      `On-chain name mismatch: config ${configName} vs chain ${chainName}`
    );
  }

  return { onChainVerified: true };
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    let configPath = defaultConfigPath;
    let constantsPath = defaultConstantsPath;
    let rpcUrl: string | undefined;
    let timeoutMs: number | undefined;
    let skipOnChain = false;
    let networkArg: string | undefined;
    let configOverride = false;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--config' && i + 1 < args.length) {
        configPath = args[++i];
        configOverride = true;
      } else if (arg === '--constants' && i + 1 < args.length) {
        constantsPath = args[++i];
      } else if (arg === '--rpc' && i + 1 < args.length) {
        rpcUrl = args[++i];
      } else if (arg === '--timeout' && i + 1 < args.length) {
        timeoutMs = Number(args[++i]);
      } else if (arg === '--skip-onchain') {
        skipOnChain = true;
      } else if (arg === '--network' && i + 1 < args.length) {
        networkArg = args[++i];
      } else if (arg.startsWith('--network=')) {
        networkArg = arg.slice('--network='.length);
      } else {
        console.warn(`Unrecognized argument: ${arg}`);
      }
    }

    if (!configOverride && networkArg) {
      const inferred = inferNetworkKey(networkArg) ?? networkArg;
      const { path: networkConfigPath } = loadTokenConfig({
        network: inferred,
      });
      configPath = networkConfigPath;
    }

    try {
      const result = await verifyAgialpha(configPath, constantsPath, {
        rpcUrl,
        timeoutMs,
        skipOnChain,
      });
      console.log(
        'AGIALPHA address, metadata, decimals, and burn address match.'
      );
      if (result.onChainVerified) {
        console.log('On-chain metadata matches configuration.');
      } else if (!skipOnChain) {
        console.log('Skipped on-chain verification (no RPC URL provided).');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exit(1);
    }
  })();
}
