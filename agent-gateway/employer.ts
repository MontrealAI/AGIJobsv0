import fs from 'fs';
import path from 'path';
import { ethers, Wallet } from 'ethers';
import { registry, TOKEN_DECIMALS, orchestratorWallet } from './utils';
import { secureLogAction } from './security';

export interface EmployerJobSpec {
  description: string;
  reward: string;
  deadlineSeconds?: number;
  metadata?: Record<string, unknown>;
  dependencies?: number[];
  uri?: string;
}

interface PostedJobRecord {
  jobId: number;
  description: string;
  reward: string;
  deadline: number;
  metadata?: Record<string, unknown>;
  dependencies: number[];
  txHash: string;
  uri: string;
  specHash: string;
  createdAt: string;
}

const EMPLOYER_DIR = path.resolve(__dirname, '../storage/employer');
const JOB_LEDGER = path.join(EMPLOYER_DIR, 'jobs.json');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function readJobLedger(): Promise<PostedJobRecord[]> {
  try {
    const raw = await fs.promises.readFile(JOB_LEDGER, 'utf8');
    return JSON.parse(raw) as PostedJobRecord[];
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn('Failed to read job ledger', err);
    }
    return [];
  }
}

async function writeJobLedger(records: PostedJobRecord[]): Promise<void> {
  ensureDir(path.dirname(JOB_LEDGER));
  await fs.promises.writeFile(
    JOB_LEDGER,
    JSON.stringify(records, null, 2),
    'utf8'
  );
}

function serialiseMetadata(spec: EmployerJobSpec): {
  uri: string;
  specHash: string;
} {
  const metadata = {
    description: spec.description,
    metadata: spec.metadata ?? {},
    dependencies: spec.dependencies ?? [],
    generatedAt: new Date().toISOString(),
  };
  const payload = JSON.stringify(metadata, null, 2);
  const hash = ethers.id(payload);
  const uri =
    spec.uri ??
    `data:application/json;base64,${Buffer.from(payload).toString('base64')}`;
  return { uri, specHash: hash };
}

export async function postJob(
  spec: EmployerJobSpec,
  wallet: Wallet | undefined = orchestratorWallet
): Promise<PostedJobRecord> {
  if (!wallet) {
    throw new Error('No orchestrator wallet available to post jobs');
  }
  const reward = ethers.parseUnits(spec.reward, TOKEN_DECIMALS);
  const deadlineSeconds = spec.deadlineSeconds ?? 3600;
  const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
  const { uri, specHash } = serialiseMetadata(spec);
  const tx = await (registry as any)
    .connect(wallet)
    .createJob(reward, deadline, specHash, uri);
  await tx.wait();
  const nextJobId = await (registry as any).nextJobId();
  const jobId = Number(nextJobId) - 1;
  const record: PostedJobRecord = {
    jobId,
    description: spec.description,
    reward: spec.reward,
    deadline,
    metadata: spec.metadata,
    dependencies: spec.dependencies ?? [],
    txHash: tx.hash,
    uri,
    specHash,
    createdAt: new Date().toISOString(),
  };
  const ledger = await readJobLedger();
  ledger.push(record);
  await writeJobLedger(ledger);
  await secureLogAction({
    component: 'employer',
    action: 'post-job',
    employer: wallet.address,
    jobId: String(jobId),
    metadata: { txHash: tx.hash, reward: spec.reward },
    success: true,
  });
  return record;
}

export async function listPostedJobs(): Promise<PostedJobRecord[]> {
  return readJobLedger();
}

export async function linkDependency(
  parentJobId: number,
  childJobId: number
): Promise<void> {
  const ledger = await readJobLedger();
  const entry = ledger.find((job) => job.jobId === parentJobId);
  if (!entry) return;
  if (!entry.dependencies.includes(childJobId)) {
    entry.dependencies.push(childJobId);
    await writeJobLedger(ledger);
  }
}
