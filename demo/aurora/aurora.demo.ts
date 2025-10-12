#!/usr/bin/env ts-node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import { ethers } from 'ethers';

interface Manifest {
  network?: string;
  contracts?: Record<string, string>;
  [key: string]: unknown;
}

function resolveNetwork(argv: string[]): string {
  const index = argv.indexOf('--network');
  if (index !== -1 && argv[index + 1]) {
    return argv[index + 1];
  }
  return process.env.NETWORK ?? process.env.AGI_DEMO_NETWORK ?? 'localhost';
}

function guessManifestPaths(network: string): string[] {
  const hints = [process.env.AURORA_DEPLOYMENT_MANIFEST, process.env.AGI_DEPLOYMENT_MANIFEST];
  if (network) {
    hints.push(path.join('deployment-config', `latest-deployment.${network}.json`));
  }
  hints.push(path.join('deployment-config', 'latest-deployment.json'));
  hints.push(path.join('docs', 'deployment-addresses.json'));
  return hints.filter((candidate): candidate is string => Boolean(candidate));
}

function loadManifest(paths: string[]): { manifest: Manifest | null; source?: string } {
  for (const candidate of paths) {
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8')) as Manifest;
      return { manifest: parsed, source: resolved };
    } catch (error) {
      console.warn(`⚠️  Unable to parse manifest at ${resolved}: ${(error as Error).message}`);
    }
  }
  return { manifest: null };
}

function applyManifest(manifest: Manifest | null) {
  if (!manifest) return;
  const contracts = (manifest.contracts as Record<string, string>) || manifest;
  const mapping: Record<string, string[]> = {
    JOB_REGISTRY: ['JobRegistry'],
    STAKE_MANAGER: ['StakeManager'],
    VALIDATION_MODULE: ['ValidationModule'],
    DISPUTE_MODULE: ['DisputeModule'],
    REPUTATION_ENGINE: ['ReputationEngine'],
    SYSTEM_PAUSE: ['SystemPause'],
    FEE_POOL: ['FeePool'],
    IDENTITY_REGISTRY: ['IdentityRegistry'],
    PLATFORM_REGISTRY: ['PlatformRegistry'],
    JOB_ROUTER: ['JobRouter'],
    PLATFORM_INCENTIVES: ['PlatformIncentives'],
  };
  for (const [envKey, keys] of Object.entries(mapping)) {
    for (const key of keys) {
      const value = contracts?.[key];
      if (typeof value === 'string' && value.length > 0) {
        process.env[envKey] = value;
        break;
      }
    }
  }
}

function ensureTokenConfig() {
  if (!process.env.AGIALPHA_TOKEN) {
    try {
      const tokenCfg = JSON.parse(fs.readFileSync(path.join('config', 'agialpha.json'), 'utf8'));
      if (tokenCfg?.address) {
        process.env.AGIALPHA_TOKEN = tokenCfg.address;
      }
    } catch (error) {
      console.warn(`⚠️  Unable to load token config: ${(error as Error).message}`);
    }
  }
  if (!process.env.ATTESTATION_REGISTRY) {
    process.env.ATTESTATION_REGISTRY = ethers.ZeroAddress;
  }
}

function ensureReportsDir(network: string) {
  const dir = path.join('reports', network, 'aurora', 'receipts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeReceipt(network: string, name: string, data: unknown) {
  const dir = ensureReportsDir(network);
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
}

function execJson(command: string, env: NodeJS.ProcessEnv) {
  const output = cp.execSync(command, { env, stdio: 'pipe' }).toString('utf8').trim();
  try {
    return JSON.parse(output);
  } catch (error) {
    console.warn(`⚠️  Unable to parse JSON output from ${command}: ${output}`);
    throw error;
  }
}

function toTokenAmount(value: string | number | bigint, decimals = 6): string {
  const big = typeof value === 'bigint' ? value : BigInt(value);
  return ethers.formatUnits(big, decimals);
}

async function main() {
  const network = resolveNetwork(process.argv);
  const displayNetwork = process.env.AGI_DEMO_NETWORK ?? network ?? 'localhost';
  const receiptsDir = ensureReportsDir(displayNetwork);

  const { manifest, source } = loadManifest(guessManifestPaths(network));
  applyManifest(manifest);
  ensureTokenConfig();

  const env = { ...process.env, NETWORK: network, AGI_DEMO_NETWORK: displayNetwork };

  console.log('⏳ compiling contracts to refresh artefacts...');
  cp.execSync('npx hardhat compile --force', { env, stdio: 'inherit' });

  if (manifest) {
    writeReceipt(displayNetwork, 'deploy.json', {
      manifest: source ?? null,
      network: manifest.network ?? network,
      contracts: manifest.contracts ?? manifest,
    });
  }

  const specPath = path.join('demo', 'aurora', 'config', 'aurora.spec@v2.json');
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

  console.log('🛰  posting flagship job...');
  const post = execJson(
    `node examples/ethers-quickstart.js postJob --spec ${specPath}`,
    env,
  );
  writeReceipt(displayNetwork, 'postJob.json', post);
  const jobId = Number(post?.jobId ?? 1);

  const stakeDecimals = spec?.escrow?.decimals ? Number(spec.escrow.decimals) : 6;
  const workerStakeTokens = toTokenAmount(spec?.stake?.worker ?? '20000000', stakeDecimals);
  const validatorStakeTokens = toTokenAmount(spec?.stake?.validator ?? '50000000', stakeDecimals);

  console.log('💎 preparing worker stake...');
  execJson(
    `node examples/ethers-quickstart.js prepareStake --amount ${workerStakeTokens}`,
    env,
  );
  const workerStake = execJson(
    `node examples/ethers-quickstart.js stake --role agent --amount ${workerStakeTokens}`,
    env,
  );
  writeReceipt(displayNetwork, 'stake-worker.json', workerStake);

  console.log('🛡  preparing validator stake...');
  execJson(
    `node examples/ethers-quickstart.js prepareStake --amount ${validatorStakeTokens}`,
    env,
  );
  const validatorStake = execJson(
    `node examples/ethers-quickstart.js stake --role validator --amount ${validatorStakeTokens}`,
    env,
  );
  writeReceipt(displayNetwork, 'stake-validator.json', validatorStake);

  console.log('📦 submitting deliverable...');
  const resultUri = 'ipfs://example-result-hash';
  const submit = execJson(
    `node examples/ethers-quickstart.js submit --job ${jobId} --result ${resultUri}`,
    env,
  );
  writeReceipt(displayNetwork, 'submit.json', submit);

  console.log('🧪 computing validation commit plan...');
  const plan = execJson(
    `node examples/ethers-quickstart.js computeValidationCommit --job ${jobId} --approve true`,
    env,
  );
  fs.writeFileSync(path.join(receiptsDir, 'commit.json'), JSON.stringify(plan, null, 2));

  console.log('🧾 executing validation flow...');
  const validate = execJson(
    `node examples/ethers-quickstart.js validate --job ${jobId} --approve true --commit ${path.join(
      receiptsDir,
      'commit.json',
    )}`,
    env,
  );
  writeReceipt(displayNetwork, 'validate.json', validate);

  console.log('🌡  thermostat dry-run (best effort)...');
  try {
    cp.execSync(`npx hardhat run scripts/v2/updateThermodynamics.ts --network ${network}`, {
      env,
      stdio: 'inherit',
    });
  } catch (error) {
    console.warn(`⚠️  Thermostat update skipped: ${(error as Error).message}`);
  }

  writeReceipt(displayNetwork, 'finalize.json', {
    txHash: validate?.finalizeTx ?? null,
    payouts: validate?.payouts ?? null,
  });

  console.log('✅ AURORA demo completed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
