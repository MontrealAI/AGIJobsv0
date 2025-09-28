#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Web3Storage, getFilesFromPath } from 'web3.storage';
import pinataSDK from '@pinata/sdk';
import { ethers } from 'ethers';
import contentHash from 'content-hash';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DIST_DIR = path.join(ROOT_DIR, 'apps', 'onebox-static', 'dist');
const CONFIG_PATH = path.join(ROOT_DIR, 'deployment-config', 'onebox-static.json');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function ensureDistPresent() {
  try {
    const stat = await fs.stat(DIST_DIR);
    if (!stat.isDirectory()) {
      throw new Error(`Expected ${DIST_DIR} to be a directory`);
    }
    const entries = await fs.readdir(DIST_DIR);
    if (entries.length === 0) {
      throw new Error(`No build artifacts found in ${DIST_DIR}. Run npm run onebox:static:build first.`);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Missing build directory ${DIST_DIR}. Run npm run onebox:static:build first.`);
    }
    throw err;
  }
}

async function uploadToWeb3Storage(token) {
  const client = new Web3Storage({ token });
  const files = await getFilesFromPath(DIST_DIR);
  const cid = await client.put(files, {
    wrapWithDirectory: true,
    name: `onebox-static-${new Date().toISOString()}`,
  });
  const status = await waitFor(async () => {
    const info = await client.status(cid);
    if (!info) {
      return null;
    }
    const pinned = info.pins?.find((pin) => pin.status === 'Pinned');
    if (pinned) {
      return { info, pinned };
    }
    return null;
  }, { label: 'web3.storage pin', attempts: 10, delayMs: 5000 });

  return {
    cid,
    status: status?.info ?? null,
  };
}

async function pinWithPinata(jwt, cid) {
  const pinata = new pinataSDK({ pinataJWTKey: jwt });
  const metadata = {
    name: `onebox-static-${new Date().toISOString()}`,
  };
  const pinResponse = await pinata.pinByHash(cid, { pinataMetadata: metadata });

  const verification = await waitFor(async () => {
    const list = await pinata.pinList({ hashContains: cid, status: 'pinned' });
    if (list?.rows?.length) {
      return list.rows[0];
    }
    return null;
  }, { label: 'Pinata pin', attempts: 10, delayMs: 5000 });

  return {
    pinata,
    pinResponse,
    verification,
  };
}

async function updateEnsContenthash({
  rpcUrl,
  signerKey,
  resolverAddress,
  ensName,
  cid,
}) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(signerKey, provider);
  const resolver = new ethers.Contract(
    resolverAddress,
    [
      'function setContenthash(bytes32 node, bytes calldata hash) external',
      'function contenthash(bytes32 node) external view returns (bytes memory)',
    ],
    wallet,
  );

  const node = ethers.namehash(ensName);
  const encoded = `0x${contentHash.encode('ipfs-ns', cid)}`;

  const tx = await resolver.setContenthash(node, encoded);
  const receipt = await tx.wait();

  return {
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
    encoded,
  };
}

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

async function writeConfig(data) {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, json, 'utf8');
}

async function waitFor(fn, { attempts, delayMs, label }) {
  let attempt = 0;
  while (attempt < attempts) {
    const result = await fn();
    if (result) {
      return result;
    }
    attempt += 1;
    if (attempt < attempts) {
      console.log(`Waiting for ${label}... (${attempt}/${attempts - 1})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  await ensureDistPresent();

  const web3Token = requiredEnv('ONEBOX_W3S_TOKEN');
  const pinataJwt = requiredEnv('ONEBOX_PINATA_JWT');
  const rpcUrl = requiredEnv('ONEBOX_RPC_URL');
  const signerKey = requiredEnv('ONEBOX_SIGNER_KEY');
  const resolverAddress = requiredEnv('ONEBOX_ENS_RESOLVER');
  const ensName = requiredEnv('ONEBOX_ENS_NAME');

  console.log('Uploading onebox-static dist/ bundle to web3.storage...');
  const web3Result = await uploadToWeb3Storage(web3Token);
  const { cid } = web3Result;
  console.log(`✔ Uploaded to web3.storage with root CID: ${cid}`);

  console.log('Pinning CID to Pinata...');
  const pinataResult = await pinWithPinata(pinataJwt, cid);
  console.log('✔ Pinata pin verified');

  console.log('Updating ENS contenthash...');
  const ensResult = await updateEnsContenthash({
    rpcUrl,
    signerKey,
    resolverAddress,
    ensName,
    cid,
  });
  console.log(`✔ ENS contenthash updated in tx ${ensResult.txHash}`);

  const releasedAt = new Date().toISOString();
  const ethLimoUrl = `https://${ensName}.eth.limo`;
  const pinataGateway = (process.env.ONEBOX_PINATA_GATEWAY ?? 'https://gateway.pinata.cloud').replace(/\/$/, '');
  const gateways = [
    `https://w3s.link/ipfs/${cid}/`,
    `${pinataGateway}/ipfs/${cid}/`,
    ethLimoUrl,
  ];

  const config = await readConfig();
  const releaseEntry = {
    cid,
    releasedAt,
    gateways,
    pins: {
      web3Storage: {
        status: web3Result.status?.pins ?? [],
        dagSize: web3Result.status?.dagSize ?? null,
        deals: web3Result.status?.deals ?? [],
      },
      pinata: {
        id: pinataResult.pinResponse?.id ?? null,
        size: pinataResult.pinResponse?.size ?? null,
        status: pinataResult.verification?.status ?? null,
        region: pinataResult.verification?.region ?? null,
      },
    },
    ens: {
      name: ensName,
      contenthash: ensResult.encoded,
      txHash: ensResult.txHash,
      blockNumber: ensResult.blockNumber,
      updatedAt: releasedAt,
    },
  };

  const history = Array.isArray(config.history) ? config.history : [];
  history.push(releaseEntry);

  const updated = {
    latest: releaseEntry,
    history,
  };

  await writeConfig(updated);

  console.log('\nRelease complete!');
  console.log(`CID: ${cid}`);
  console.log('Gateways:');
  gateways.forEach((url) => console.log(`  - ${url}`));
  console.log(`ENS contenthash tx: ${ensResult.txHash}`);
  console.log(`eth.limo URL: ${ethLimoUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
