#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const namehash = require('eth-ens-namehash');
require('dotenv').config();

const metrics = require('./metrics');
const { AGIALPHA } = require('../../scripts/constants');

const CONFIG_PATH = process.env.GATEWAY_CONFIG
  ? path.resolve(process.cwd(), process.env.GATEWAY_CONFIG)
  : path.resolve(__dirname, 'gateway.config.json');

const AGENT_ROLE = 0;
const ZERO_BYTES = '0x';

function loadConfig(configPath = CONFIG_PATH) {
  const file = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(file);
  return parsed;
}

function bigIntFrom(value, fallback = 0n) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  try {
    return typeof value === 'bigint' ? value : BigInt(value);
  } catch (err) {
    throw new Error(`Unable to parse bigint from value ${value}`);
  }
}

function ensLabelFrom(full) {
  if (!full) return '';
  const normalised = namehash.normalize(full);
  const [label] = normalised.split('.');
  return label || '';
}

function ensureEnsMembership(ensName, cfg) {
  if (!ensName) {
    throw new Error('ENS name missing for agent runtime (set AGENT_ENS).');
  }
  const normalised = namehash.normalize(ensName);
  const allowed = new Set();
  if (cfg?.ens?.agentRoot) {
    allowed.add(namehash.normalize(cfg.ens.agentRoot));
  }
  if (cfg?.ens?.alphaClubRoot && cfg?.ens?.acceptAlphaRoot) {
    allowed.add(namehash.normalize(cfg.ens.alphaClubRoot));
  }
  if (cfg?.ens?.clubRoot && cfg?.ens?.acceptAlphaRoot) {
    allowed.add(namehash.normalize(cfg.ens.clubRoot));
  }
  if (allowed.size === 0) {
    return;
  }
  for (const root of allowed) {
    if (normalised.endsWith(`.${root}`) || normalised === root) {
      return;
    }
  }
  const allowedList = Array.from(allowed).join(', ');
  throw new Error(
    `ENS name ${normalised} not under allowed roots (${allowedList})`
  );
}

function shouldApply(job, policy) {
  const minReward = bigIntFrom(policy?.minRewardWei, 0n);
  const maxStake = bigIntFrom(policy?.maxStakeWei, 0n);
  if (job.reward < minReward) {
    return false;
  }
  if (maxStake > 0n && job.requiredStake > maxStake) {
    return false;
  }
  if (policy?.skipCategories?.length && job.category) {
    const skip = policy.skipCategories.map((entry) =>
      String(entry).toLowerCase()
    );
    if (skip.includes(String(job.category).toLowerCase())) {
      return false;
    }
  }
  return true;
}

async function ensureStake(stakeManager, wallet, required, policy) {
  if (!required || required <= 0n) {
    return;
  }
  const current = await stakeManager.stakeOf(wallet.address, AGENT_ROLE);
  if (current >= required) {
    return;
  }
  const delta = required - current;
  const maxStake = bigIntFrom(policy?.maxStakeWei, 0n);
  if (maxStake > 0n && delta > maxStake) {
    throw new Error(`Stake delta ${delta} exceeds policy cap ${maxStake}`);
  }
  const tx = await stakeManager.depositStake(AGENT_ROLE, delta);
  await tx.wait(2);
}

function parseProvider(cfg) {
  const fallback = cfg?.rpcUrl || process.env.RPC_URL || '';
  const networkKey = (cfg?.network || '').toLowerCase();
  if (networkKey === 'mainnet' && process.env.RPC_MAINNET) {
    return new ethers.JsonRpcProvider(process.env.RPC_MAINNET);
  }
  if (networkKey === 'sepolia' && process.env.RPC_SEPOLIA) {
    return new ethers.JsonRpcProvider(process.env.RPC_SEPOLIA);
  }
  if (!fallback) {
    throw new Error('RPC URL missing (set rpcUrl in config or RPC_URL env).');
  }
  return new ethers.JsonRpcProvider(fallback);
}

function loadWallet(provider) {
  if (process.env.PRIVATE_KEY) {
    return new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  }
  if (process.env.MNEMONIC) {
    return ethers.HDNodeWallet.fromPhrase(process.env.MNEMONIC).connect(
      provider
    );
  }
  throw new Error('Provide PRIVATE_KEY or MNEMONIC in environment.');
}

function resolveAddress(label, value) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`Missing or invalid address for ${label}`);
  }
  return value;
}

async function main() {
  const cfg = loadConfig();
  const provider = parseProvider(cfg);
  const wallet = loadWallet(provider);

  const jobRegistryAddress = resolveAddress(
    'jobRegistry',
    cfg.jobRegistry || cfg.jobRegistryAddress
  );
  const stakeManagerAddress = resolveAddress(
    'stakeManager',
    cfg.stakeManager || cfg.stakeManagerAddress
  );

  const jobRegistryAbi = [
    'event JobCreated(uint256 indexed jobId,address indexed employer,address indexed agent,uint256 reward,uint256 stake,uint256 fee,bytes32 specHash,string uri)',
    'function jobs(uint256 jobId) view returns (tuple(address employer,address agent,uint128 reward,uint96 stake,uint128 burnReceiptAmount,bytes32 uriHash,bytes32 resultHash,bytes32 specHash,uint256 packedMetadata))',
    'function applyForJob(uint256 jobId,string subdomain,bytes32[] proof)',
    'function submit(uint256 jobId,bytes32 resultHash,string resultURI,string subdomain,bytes32[] proof)',
    'function finalize(uint256 jobId)',
  ];

  const stakeManagerAbi = [
    'function stakeOf(address user,uint8 role) view returns (uint256)',
    'function depositStake(uint8 role,uint256 amount)',
    'function token() view returns (address)',
  ];

  const jobRegistry = new ethers.Contract(
    jobRegistryAddress,
    jobRegistryAbi,
    provider
  );
  const jobRegistryWithSigner = jobRegistry.connect(wallet);
  const stakeManager = new ethers.Contract(
    stakeManagerAddress,
    stakeManagerAbi,
    wallet
  );

  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const stakeToken = await stakeManager.token();
  if (chainId === 1 && stakeToken.toLowerCase() !== AGIALPHA.toLowerCase()) {
    throw new Error(
      `StakeManager token mismatch: expected ${AGIALPHA} on mainnet, received ${stakeToken}`
    );
  }

  const agentEns = process.env.AGENT_ENS || process.env.ENS_LABEL || '';
  ensureEnsMembership(agentEns, cfg);
  const agentLabel = ensLabelFrom(agentEns);

  console.log(
    `[gateway] network=${network.name} chainId=${chainId} wallet=${wallet.address} ens=${agentEns}`
  );

  const policy = cfg.policy || {};

  jobRegistry.on(
    'JobCreated',
    async (jobId, employer, agent, reward, stake, fee, specHash, uri) => {
      const started = Date.now();
      try {
        if (agent && agent !== ethers.ZeroAddress) {
          return;
        }
        const job = await jobRegistry.jobs(jobId);
        const rewardWei = BigInt(job.reward ?? reward ?? 0);
        const requiredStake = BigInt(job.stake ?? stake ?? 0);
        const meta = {
          id: jobId.toString(),
          reward: rewardWei.toString(),
          stake: requiredStake.toString(),
          specHash: specHash,
          uri,
        };
        const jobDetails = {
          reward: rewardWei,
          requiredStake,
          employer,
          category: '',
        };
        if (!shouldApply(jobDetails, policy)) {
          metrics.logTelemetry('job.skipped', meta);
          return;
        }
        await ensureStake(stakeManager, wallet, requiredStake, policy);
        console.log(
          `[gateway] applying job=${jobId.toString()} reward=${rewardWei.toString()} stake=${requiredStake.toString()}`
        );
        const tx = await jobRegistryWithSigner.applyForJob(
          jobId,
          agentLabel,
          []
        );
        await tx.wait(2);
        metrics.logEnergy('apply', {
          jobId: jobId.toString(),
          millis: Date.now() - started,
        });
      } catch (err) {
        const message = err?.error?.message || err?.message || String(err);
        console.error('[gateway] JobCreated handler error:', message);
        metrics.logQuarantine('apply', message, { jobId: jobId.toString() });
      }
    }
  );

  async function submit(jobId, resultHash, resultURI) {
    const started = Date.now();
    try {
      if (resultHash && resultHash !== ZERO_BYTES) {
        const submitTx = await jobRegistryWithSigner.submit(
          jobId,
          resultHash,
          resultURI || '',
          agentLabel,
          []
        );
        await submitTx.wait(2);
      }
      const finalizeTx = await jobRegistryWithSigner.finalize(jobId);
      await finalizeTx.wait(2);
      metrics.logEnergy('submit', {
        jobId: jobId.toString(),
        millis: Date.now() - started,
      });
    } catch (err) {
      const message = err?.error?.message || err?.message || String(err);
      console.error('[gateway] submit error:', message);
      metrics.logQuarantine('submit', message, { jobId: jobId.toString() });
      throw err;
    }
  }

  console.log('[gateway] listening for JobCreated events…');
  metrics.logTelemetry('gateway.started', { chainId, wallet: wallet.address });

  return { submit };
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[gateway] fatal:', err.message || err);
    metrics.logQuarantine('fatal', err.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  loadConfig,
  ensLabelFrom,
  shouldApply,
  main,
};
