import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

interface CliArgs {
  [key: string]: string | boolean;
}

interface AnchorInputs {
  leaves: string[];
  leafHashes: string[];
  files: string[];
  root: string;
  metadataHash: string;
}

interface AnchorRecord {
  root: string;
  leafCount: number;
  leafHashes: string[];
  metadataHash: string;
  files: string[];
  anchoredAt: string;
  chainId?: string;
  target: string;
  txHash?: string;
  tag: string;
}

const DEFAULT_LOOKBACK_HOURS = Number(process.env.ANCHOR_LOOKBACK_HOURS ?? 24);
const DEFAULT_LOG_DIR = path.resolve(process.env.AUDIT_LOG_DIR || 'logs/audit');
const ANCHOR_TAG = ethers.hexlify(ethers.toUtf8Bytes('LOGR'));

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const result: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i++;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readAuditEntries(
  logDir: string,
  lookbackHours: number
): { entries: string[]; files: string[] } {
  if (!fs.existsSync(logDir)) {
    return { entries: [], files: [] };
  }
  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
  const entries: string[] = [];
  const files: string[] = [];
  const dirEntries = fs
    .readdirSync(logDir)
    .filter((name) => name.endsWith('.log'))
    .map((name) => ({
      name,
      fullPath: path.join(logDir, name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of dirEntries) {
    const stats = fs.statSync(entry.fullPath);
    if (stats.mtimeMs < cutoff) continue;
    const raw = fs.readFileSync(entry.fullPath, 'utf8');
    if (!raw) continue;
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    entries.push(...lines);
    files.push(path.relative(process.cwd(), entry.fullPath));
  }
  return { entries, files };
}

function buildMerkleTree(entries: string[], files: string[]): AnchorInputs {
  const leaves = entries;
  const hashed = leaves.map((line) =>
    ethers.keccak256(ethers.toUtf8Bytes(line))
  );
  if (hashed.length === 0) {
    return {
      leaves,
      leafHashes: [],
      files,
      root: ethers.ZeroHash,
      metadataHash: ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify({ leafHashes: [], files }))
      ),
    };
  }
  const levels: string[][] = [hashed];
  while (levels[levels.length - 1].length > 1) {
    const current = levels[levels.length - 1];
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1] ?? left;
      const combined = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [left, right]
      );
      next.push(combined);
    }
    levels.push(next);
  }
  const metadataHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify({ leafHashes: hashed, files }))
  );
  return {
    leaves,
    leafHashes: hashed,
    files,
    root: levels[levels.length - 1][0],
    metadataHash,
  };
}

async function anchorRoot(
  logDir: string,
  inputs: AnchorInputs,
  target: string,
  rpcUrl: string,
  privateKey: string,
  dryRun: boolean
): Promise<AnchorRecord> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const destination = target || wallet.address;
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const payload = coder.encode(
    ['bytes4', 'bytes32', 'uint256', 'bytes32'],
    [
      ANCHOR_TAG.slice(0, 10),
      inputs.root,
      BigInt(inputs.leafHashes.length),
      inputs.metadataHash,
    ]
  );
  const record: AnchorRecord = {
    root: inputs.root,
    leafCount: inputs.leafHashes.length,
    leafHashes: inputs.leafHashes,
    metadataHash: inputs.metadataHash,
    files: inputs.files,
    anchoredAt: new Date().toISOString(),
    target: destination,
    tag: ANCHOR_TAG.slice(0, 10),
  };

  if (dryRun) {
    console.log('Dry run. Prepared anchor payload:', record);
    return record;
  }

  const tx = await wallet.sendTransaction({
    to: destination,
    data: payload,
    value: 0n,
  });
  const receipt = await tx.wait();
  const network = await provider.getNetwork();
  record.txHash = receipt?.hash ?? tx.hash;
  record.chainId = network.chainId.toString();

  const anchorsDir = path.join(logDir, 'anchors');
  ensureDirectory(anchorsDir);
  const filename = `${record.anchoredAt.replace(
    /[:]/g,
    '-'
  )}-${record.root.slice(2, 10)}.json`;
  fs.writeFileSync(
    path.join(anchorsDir, filename),
    JSON.stringify(record, null, 2)
  );

  console.log('Anchored log Merkle root:', record);
  return record;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const lookbackHours = args['lookback-hours']
    ? Number(args['lookback-hours'])
    : DEFAULT_LOOKBACK_HOURS;
  const dryRun = Boolean(args['dry-run']);
  const logDir = args['log-dir']
    ? path.resolve(args['log-dir'] as string)
    : DEFAULT_LOG_DIR;
  const rpcUrl =
    (args['rpc'] as string) ||
    process.env.ANCHOR_RPC_URL ||
    process.env.RPC_URL ||
    'http://localhost:8545';
  const target = (args['target'] as string) || process.env.ANCHOR_TARGET || '';
  const privateKey =
    (args['private-key'] as string) ||
    process.env.ANCHOR_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    '';

  if (!Number.isFinite(lookbackHours) || lookbackHours <= 0) {
    throw new Error('lookback-hours must be a positive number');
  }

  const { entries, files } = readAuditEntries(logDir, lookbackHours);
  if (entries.length === 0) {
    console.log('No audit log entries found within lookback window.');
    return;
  }

  const inputs = buildMerkleTree(entries, files);

  if (!dryRun && !privateKey) {
    throw new Error('ANCHOR_PRIVATE_KEY or --private-key is required');
  }

  await anchorRoot(logDir, inputs, target, rpcUrl, privateKey, dryRun);
}

main().catch((err) => {
  console.error('Anchor script failed:', err);
  process.exit(1);
});
