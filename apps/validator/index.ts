import { loadDisputeEvidence, DisputeEvidence } from './evidence';
import { EventLog, JsonRpcProvider, Wallet, Contract, ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import {
  createReviewedValidator,
  VALIDATION_ABI,
  REGISTRY_ABI,
  DISPUTE_ABI,
} from './runtime';
import {
  fetchArtifactBytes,
  resolveArtifactUri,
} from '../orchestrator/artifactSource';
const {
  safeErrorCode,
  ensurePrivateDirectory,
} = require('../../examples/agentic/validator-recovery');
const {
  readPrivateJson,
  validateReviewFile,
  writePrivateReport,
} = require('./review-admission.cjs');

if (require.main === module && process.argv.includes('--help')) {
  console.log(
    'Validator service: independently review each job, then admit its exact round/spec/result in VALIDATOR_REVIEW_FILE.\nUsage: node apps/validator/dist/apps/validator/index.js [--inspect-job JOB_ID]\nRequired: RPC_URL, VALIDATION_MODULE_ADDRESS, JOB_REGISTRY_ADDRESS, VALIDATOR_ADDRESS or PRIVATE_KEY.\nSee apps/validator/README.md for setup, review, private state and recovery.'
  );
  process.exit(0);
}

interface ValidatorPersonaRecord {
  ens: string;
  label?: string;
  address?: string;
  stakeTarget?: string | number;
  metadata?: Record<string, unknown>;
}

interface ValidatorPersona {
  ens: string;
  label: string;
  address?: string;
  stakeTarget?: string;
  metadata?: Record<string, unknown>;
}

interface SubmissionRecord {
  jobId: string;
  worker: string;
  resultHash: string;
  resultUri: string;
  subdomain?: string;
  fetchedAt: string;
  blockNumber?: number;
  computedHash?: string;
  contentLength?: number;
  contentType?: string;
  sample?: string;
  errors?: string[];
}

interface EvaluationResult {
  approve: boolean;
  notes: string[];
  resultUri?: string;
  resultHash?: string;
  computedHash?: string;
  contentLength?: number;
  contentType?: string;
  sample?: string;
  worker?: string;
  subdomain?: string;
  jobState: string;
  jobStateIndex: number;
  stakeBalance?: string;
  stakeTarget?: string;
  timestamp: string;
}

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const VALIDATION_MODULE_ADDRESS = process.env.VALIDATION_MODULE_ADDRESS || '';
const JOB_REGISTRY_ADDRESS = process.env.JOB_REGISTRY_ADDRESS || '';
const DISPUTE_MODULE_ADDRESS = process.env.DISPUTE_MODULE_ADDRESS || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const STAKE_MANAGER_ADDRESS = process.env.STAKE_MANAGER_ADDRESS || '';
const PERSONA_PATH =
  process.env.VALIDATOR_PERSONA_PATH || path.resolve(__dirname, 'persona.json');
const IPFS_GATEWAY = (process.env.IPFS_GATEWAY_URL || 'https://ipfs.io/ipfs/')
  .replace(/\/$/, '')
  .trim();
const SUBMISSION_LOOKBACK_BLOCKS = Number(
  process.env.SUBMISSION_LOOKBACK_BLOCKS || 200_000
);
let STORAGE_ROOT =
  process.env.VALIDATOR_REPORT_DIR ||
  path.resolve(process.cwd(), 'storage/validation-reports');
const STATE_ROOT =
  process.env.VALIDATOR_STATE_DIR ||
  path.resolve(process.cwd(), 'storage/validator-service-reveals');
const REVIEW_FILE = process.env.VALIDATOR_REVIEW_FILE;

const provider = new JsonRpcProvider(RPC_URL);
const wallet = (() => {
  if (!PRIVATE_KEY) return null;
  try {
    return new Wallet(PRIVATE_KEY, provider);
  } catch {
    throw new Error('VALIDATOR_PRIVATE_KEY_INVALID');
  }
})();
if (
  wallet &&
  process.env.VALIDATOR_ADDRESS &&
  wallet.address.toLowerCase() !== process.env.VALIDATOR_ADDRESS.toLowerCase()
)
  throw new Error('VALIDATOR_ADDRESS_MISMATCH');

const JOB_STATE_OFFSET = 0n;
const JOB_SUCCESS_OFFSET = 3n;
const JOB_BURN_CONFIRMED_OFFSET = 4n;
const JOB_AGENT_TYPES_OFFSET = 5n;
const JOB_FEE_PCT_OFFSET = 13n;
const JOB_AGENT_PCT_OFFSET = 45n;
const JOB_DEADLINE_OFFSET = 77n;
const JOB_ASSIGNED_AT_OFFSET = 141n;

const JOB_STATE_MASK = 0x7n << JOB_STATE_OFFSET;
const JOB_SUCCESS_MASK = 0x1n << JOB_SUCCESS_OFFSET;
const JOB_BURN_CONFIRMED_MASK = 0x1n << JOB_BURN_CONFIRMED_OFFSET;
const JOB_AGENT_TYPES_MASK = 0xffn << JOB_AGENT_TYPES_OFFSET;
const JOB_FEE_PCT_MASK = 0xffffffffn << JOB_FEE_PCT_OFFSET;
const JOB_AGENT_PCT_MASK = 0xffffffffn << JOB_AGENT_PCT_OFFSET;
const JOB_DEADLINE_MASK = 0xffffffffffffffffn << JOB_DEADLINE_OFFSET;
const JOB_ASSIGNED_AT_MASK = 0xffffffffffffffffn << JOB_ASSIGNED_AT_OFFSET;

function decodePackedJobMetadata(packed: any): {
  state?: number;
  success?: boolean;
  burnConfirmed?: boolean;
  agentTypes?: number;
  feePct?: bigint;
  agentPct?: bigint;
  deadline?: bigint;
  assignedAt?: bigint;
} {
  if (packed === undefined || packed === null) {
    return {};
  }
  let value: bigint;
  if (typeof packed === 'bigint') {
    value = packed;
  } else if (typeof packed === 'number' && Number.isFinite(packed)) {
    value = BigInt(packed);
  } else if (typeof packed === 'string') {
    value = BigInt(packed);
  } else if (typeof (packed as any).toString === 'function') {
    value = BigInt((packed as any).toString());
  } else {
    return {};
  }
  return {
    state: Number((value & JOB_STATE_MASK) >> JOB_STATE_OFFSET),
    success: (value & JOB_SUCCESS_MASK) !== 0n,
    burnConfirmed: (value & JOB_BURN_CONFIRMED_MASK) !== 0n,
    agentTypes: Number(
      (value & JOB_AGENT_TYPES_MASK) >> JOB_AGENT_TYPES_OFFSET
    ),
    feePct: (value & JOB_FEE_PCT_MASK) >> JOB_FEE_PCT_OFFSET,
    agentPct: (value & JOB_AGENT_PCT_MASK) >> JOB_AGENT_PCT_OFFSET,
    deadline: (value & JOB_DEADLINE_MASK) >> JOB_DEADLINE_OFFSET,
    assignedAt: (value & JOB_ASSIGNED_AT_MASK) >> JOB_ASSIGNED_AT_OFFSET,
  };
}

const STAKE_MANAGER_ABI = [
  'function stakeOf(address user, uint8 role) view returns (uint256)',
];

const stakeManager = STAKE_MANAGER_ADDRESS
  ? new Contract(STAKE_MANAGER_ADDRESS, STAKE_MANAGER_ABI, provider)
  : null;

const validation = new Contract(
  VALIDATION_MODULE_ADDRESS,
  VALIDATION_ABI,
  provider
);
const registry = new Contract(JOB_REGISTRY_ADDRESS, REGISTRY_ABI, provider);
const dispute = DISPUTE_MODULE_ADDRESS
  ? new Contract(DISPUTE_MODULE_ADDRESS, DISPUTE_ABI, provider)
  : null;

const persona = loadPersona(PERSONA_PATH);
const personaStakeTarget = parseStakeTarget(persona.stakeTarget);
const personaLabel = persona.label;
const validatorAddress = wallet?.address.toLowerCase();

if (wallet && persona.address) {
  const normalizedPersonaAddress = persona.address.toLowerCase();
  if (normalizedPersonaAddress !== validatorAddress) {
    throw new Error('VALIDATOR_PERSONA_ADDRESS_MISMATCH');
  }
}

if (wallet && !persona.address) {
  persona.address = wallet.address;
}

if (!persona.ens.endsWith('.club.agi.eth')) {
  throw new Error('VALIDATOR_PERSONA_ENS_INVALID');
}

const submissions = new Map<string, SubmissionRecord>();

function evaluationPath(jobId: bigint | number, address?: string): string {
  const suffix = address ? `-${address.toLowerCase()}` : '';
  return path.join(STORAGE_ROOT, `${jobId}${suffix}-evaluation.json`);
}

function submissionPath(jobId: bigint | number): string {
  return path.join(STORAGE_ROOT, `${jobId}-submission.json`);
}

function disputePath(jobId: bigint | number, address?: string): string {
  const suffix = address ? `-${address.toLowerCase()}` : '';
  return path.join(STORAGE_ROOT, `${jobId}${suffix}-dispute.json`);
}

function loadPersona(filePath: string): ValidatorPersona {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`persona file missing at ${filePath}`);
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as ValidatorPersonaRecord;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('persona file malformed');
    }
    if (!parsed.ens || typeof parsed.ens !== 'string') {
      throw new Error('persona ens is required');
    }
    const trimmedEns = parsed.ens.trim();
    const label =
      (parsed.label && parsed.label.trim()) ||
      trimmedEns.replace(/\.club\.agi\.eth$/i, '').split('.')[0];
    if (!label) {
      throw new Error('persona label could not be derived');
    }
    return {
      ens: trimmedEns,
      label,
      address: parsed.address,
      stakeTarget:
        parsed.stakeTarget !== undefined
          ? String(parsed.stakeTarget)
          : undefined,
      metadata: parsed.metadata,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'unknown persona load failure';
    throw new Error(`Failed to load validator persona: ${message}`);
  }
}

function parseStakeTarget(value?: string | number): bigint | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return ethers.parseUnits(value.toString(), 18);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^0x/i.test(trimmed)) {
    return BigInt(trimmed);
  }
  if (/^\d+$/.test(trimmed)) {
    return BigInt(trimmed);
  }
  return ethers.parseUnits(trimmed, 18);
}

async function fetchArtifact(uri: string): Promise<{
  bytes: Uint8Array;
  text: string | null;
  contentType: string | null;
}> {
  const target = resolveArtifactUri(uri, IPFS_GATEWAY);
  const bytes = await fetchArtifactBytes(target, IPFS_GATEWAY);
  return { bytes, text: new TextDecoder().decode(bytes), contentType: null };
}

function saveReport(file: string, record: unknown): void {
  writePrivateReport(STORAGE_ROOT, path.basename(file), record);
}

function cacheSubmission(jobId: bigint, record: SubmissionRecord): void {
  const key = jobId.toString();
  submissions.delete(key);
  submissions.set(key, record);
  while (submissions.size > 1024)
    submissions.delete(submissions.keys().next().value!);
}

function persistSubmission(jobId: bigint, record: SubmissionRecord): void {
  try {
    saveReport(submissionPath(jobId), record);
  } catch (err) {
    console.error('Failed to persist submission record', safeErrorCode(err));
  }
}

function loadSubmission(jobId: bigint): SubmissionRecord | null {
  if (submissions.has(jobId.toString())) {
    return submissions.get(jobId.toString()) ?? null;
  }
  const file = submissionPath(jobId);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = readPrivateJson(file) as SubmissionRecord;
    cacheSubmission(jobId, parsed);
    return parsed;
  } catch (err) {
    console.warn('Failed to load cached submission record', safeErrorCode(err));
    return null;
  }
}

async function fetchSubmissionEvent(jobId: bigint): Promise<SubmissionRecord> {
  const filter = registry.filters?.ResultSubmitted
    ? registry.filters.ResultSubmitted(jobId)
    : null;
  if (!filter) {
    throw new Error('ResultSubmitted event unavailable on registry ABI');
  }
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - SUBMISSION_LOOKBACK_BLOCKS);
  const events = await registry.queryFilter(filter, fromBlock, latest);
  if (!events.length) {
    throw new Error('No submission events found');
  }
  const evt = events[events.length - 1] as EventLog;
  const args = evt.args as any;
  const worker: string =
    (args?.worker as string) ??
    (Array.isArray(args) ? args[1] : ethers.ZeroAddress);
  const resultHash: string =
    (args?.resultHash as string) ??
    (Array.isArray(args) ? args[2] : ethers.ZeroHash);
  const resultUri: string =
    (args?.resultURI as string) ??
    (args?.resultUri as string) ??
    (Array.isArray(args) ? args[3] : '');
  const subdomain: string | undefined =
    (args?.subdomain as string) ?? (Array.isArray(args) ? args[4] : undefined);
  return {
    jobId: jobId.toString(),
    worker,
    resultHash,
    resultUri,
    subdomain,
    fetchedAt: new Date().toISOString(),
    blockNumber: Number(evt.blockNumber ?? 0),
    computedHash: undefined,
    contentLength: undefined,
    contentType: undefined,
    sample: undefined,
    errors: undefined,
  };
}

async function ensureSubmission(
  jobId: bigint,
  expectedHash: string
): Promise<SubmissionRecord | null> {
  const existing = loadSubmission(jobId);
  if (
    existing?.computedHash?.toLowerCase() === expectedHash.toLowerCase() &&
    !existing.errors?.length
  )
    return existing;
  try {
    const base = await fetchSubmissionEvent(jobId);
    const artifact = base.resultUri
      ? await fetchArtifact(base.resultUri)
      : { bytes: new Uint8Array(), text: null, contentType: null };
    const computedHash =
      artifact.bytes.length > 0 ? ethers.keccak256(artifact.bytes) : undefined;
    const record: SubmissionRecord = {
      ...base,
      computedHash,
      contentLength: artifact.bytes.length,
      contentType: artifact.contentType ?? undefined,
      sample: artifact.text ? artifact.text.slice(0, 2048) : undefined,
      errors: undefined,
    };
    cacheSubmission(jobId, record);
    persistSubmission(jobId, record);
    return record;
  } catch (err) {
    console.error('Failed to fetch submission details', safeErrorCode(err));
    return null;
  }
}

async function evaluateJob(jobId: bigint): Promise<EvaluationResult> {
  console.log(`Evaluating job ${jobId}`);
  const job = await registry.jobs(jobId);
  const metadata = decodePackedJobMetadata(job.packedMetadata);
  const state = metadata.state ?? 0;
  const states = [
    'None',
    'Created',
    'Applied',
    'Submitted',
    'Completed',
    'Disputed',
    'Finalized',
    'Cancelled',
  ];
  const jobState = states[state] ?? `Unknown(${state})`;
  const resultHash: string = (job.resultHash ?? ethers.ZeroHash) as string;
  const submission = await ensureSubmission(jobId, resultHash);
  const notes: string[] = [];
  let approve = true;

  if (!submission) {
    notes.push('No submission artifact available.');
    approve = false;
  }

  if (submission) {
    if (!submission.resultUri) {
      notes.push('Submission result URI missing.');
      approve = false;
    }
    if (!submission.contentLength || submission.contentLength === 0) {
      notes.push('Submission content is empty.');
      approve = false;
    }
    if (submission.sample && /lorem ipsum/i.test(submission.sample)) {
      notes.push('Submission sample contains placeholder text (lorem ipsum).');
      approve = false;
    }
    if (resultHash && resultHash !== ethers.ZeroHash) {
      if (!submission.computedHash) {
        notes.push(
          'Missing computed hash to compare with on-chain resultHash.'
        );
        approve = false;
      } else if (
        submission.computedHash.toLowerCase() !== resultHash.toLowerCase()
      ) {
        notes.push(
          `Result hash mismatch (expected ${resultHash}, got ${submission.computedHash}).`
        );
        approve = false;
      } else {
        notes.push('Result hash verified against submission artifact.');
      }
    }
  }

  if (state !== 3) {
    notes.push(`Job state ${jobState} indicates submission may not be ready.`);
    approve = false;
  }

  const stakeBalance = await getValidatorStake();
  if (personaStakeTarget && stakeBalance !== null) {
    if (stakeBalance < personaStakeTarget) {
      notes.push(
        `Stake ${ethers.formatUnits(
          stakeBalance,
          18
        )} below persona target ${ethers.formatUnits(personaStakeTarget, 18)}.`
      );
    } else {
      notes.push(
        `Stake target met at ${ethers.formatUnits(stakeBalance, 18)} tokens.`
      );
    }
  }

  return {
    approve,
    notes,
    resultUri: submission?.resultUri,
    resultHash,
    computedHash: submission?.computedHash,
    contentLength: submission?.contentLength,
    contentType: submission?.contentType,
    sample: submission?.sample,
    worker: submission?.worker,
    subdomain: submission?.subdomain,
    jobState,
    jobStateIndex: state,
    stakeBalance: stakeBalance !== null ? stakeBalance.toString() : undefined,
    stakeTarget: personaStakeTarget?.toString(),
    timestamp: new Date().toISOString(),
  };
}

async function getValidatorStake(): Promise<bigint | null> {
  if (!wallet || !stakeManager) return null;
  try {
    const value = await stakeManager.stakeOf(wallet.address, 1);
    if (typeof value === 'bigint') return value;
    return BigInt(value.toString());
  } catch (err) {
    console.warn('Failed to query validator stake', safeErrorCode(err));
    return null;
  }
}

let runtime: Awaited<ReturnType<typeof createReviewedValidator>> | undefined;
async function handleValidatorsSelected(jobId: bigint, validators: string[]) {
  if (!runtime) return;
  const status = await runtime.selected(jobId, validators);
  if (status === 'review-required')
    console.log(`[validator] job=${jobId} review-required`);
}

async function handleResultSubmitted(
  jobId: bigint,
  worker: string,
  resultHash: string,
  resultURI: string,
  subdomain: string,
  event?: { blockNumber?: bigint | number }
) {
  console.log(`Submission detected for job ${jobId} from ${worker}`);
  const record: SubmissionRecord = {
    jobId: jobId.toString(),
    worker,
    resultHash,
    resultUri: resultURI,
    subdomain,
    fetchedAt: new Date().toISOString(),
    blockNumber:
      typeof event?.blockNumber === 'bigint'
        ? Number(event.blockNumber)
        : event?.blockNumber,
    computedHash: undefined,
    contentLength: undefined,
    contentType: undefined,
    sample: undefined,
    errors: undefined,
  };
  if (resultURI) {
    try {
      const artifact = await fetchArtifact(resultURI);
      record.computedHash = ethers.keccak256(artifact.bytes);
      record.contentLength = artifact.bytes.length;
      record.contentType = artifact.contentType ?? undefined;
      record.sample = artifact.text ? artifact.text.slice(0, 2048) : undefined;
    } catch (err) {
      record.errors = [safeErrorCode(err)];
      console.error('Failed to fetch submission artifact', safeErrorCode(err));
    }
  }
  cacheSubmission(jobId, record);
  persistSubmission(jobId, record);
}

async function startObservers() {
  await validation.on(
    'ValidatorsSelected',
    (jobId: bigint, validators: string[]) => {
      handleValidatorsSelected(jobId, validators).catch((error) =>
        console.error('[validator] selection:', safeErrorCode(error))
      );
    }
  );
  await registry.on(
    'ResultSubmitted',
    (
      jobId: bigint,
      worker: string,
      resultHash: string,
      resultURI: string,
      subdomain: string,
      event: { blockNumber?: bigint | number }
    ) => {
      handleResultSubmitted(
        jobId,
        worker,
        resultHash,
        resultURI,
        subdomain,
        event
      ).catch((err) =>
        console.error('Failed to process ResultSubmitted', safeErrorCode(err))
      );
    }
  );
  await registry.on('JobDisputed', (jobId: bigint, caller: string) => {
    console.log(`Job ${jobId} disputed by ${caller}`);
  });

  if (dispute) {
    await dispute.on(
      'DisputeRaised',
      async (
        jobId: bigint,
        claimant: string,
        evidenceHash: string,
        reason: string
      ) => {
        console.log(`Dispute raised on job ${jobId} by ${claimant}`);
        loadDisputeEvidence(evidenceHash)
          .then((evidence) => respondToDispute(jobId, evidence, reason))
          .catch((error) =>
            console.error('[validator] dispute:', safeErrorCode(error))
          );
      }
    );
    await dispute.on(
      'DisputeResolved',
      async (jobId: bigint, resolver: string, employerWins: boolean) => {
        console.log(
          `Dispute resolved for job ${jobId} by ${resolver}, employerWins=${employerWins}`
        );
        markDisputeResolution(jobId, resolver, employerWins).catch((error) =>
          console.error('[validator] dispute resolution:', safeErrorCode(error))
        );
      }
    );
  }
}

async function respondToDispute(
  jobId: bigint,
  fetched: DisputeEvidence,
  reason: string
) {
  const evidence = fetched.text;
  console.log(`Handling dispute for job ${jobId}`);
  const disputeFile = disputePath(jobId, validatorAddress);
  let parsedEvidence: unknown = evidence;
  if (evidence) {
    try {
      parsedEvidence = JSON.parse(evidence);
    } catch {
      parsedEvidence = evidence;
    }
  }
  let evaluation: EvaluationResult | null = null;
  if (validatorAddress) {
    const evalFile = evaluationPath(jobId, validatorAddress);
    if (fs.existsSync(evalFile)) {
      try {
        evaluation = readPrivateJson(evalFile) as EvaluationResult;
      } catch (err) {
        console.warn(
          'Failed to load evaluation for dispute',
          safeErrorCode(err)
        );
      }
    }
  }
  const record = {
    jobId: jobId.toString(),
    persona: persona.ens,
    subdomain: personaLabel,
    timestamp: new Date().toISOString(),
    evidence: parsedEvidence,
    reason,
    evidenceHash: fetched.commitment,
    evidenceVerified: fetched.verified,
    evidenceError: fetched.error,
    evaluation,
    stance: evaluation
      ? evaluation.approve
        ? 'support-agent'
        : 'support-employer'
      : 'unknown',
  };
  try {
    saveReport(disputeFile, record);
    console.log(`Dispute evidence recorded at ${disputeFile}`);
  } catch (err) {
    console.error('Failed to persist dispute record', safeErrorCode(err));
  }
}

async function markDisputeResolution(
  jobId: bigint,
  resolver: string,
  employerWins: boolean
) {
  const file = disputePath(jobId, validatorAddress);
  let existing: any = null;
  if (fs.existsSync(file)) {
    try {
      existing = readPrivateJson(file);
    } catch (err) {
      console.warn(
        'Failed to read existing dispute record',
        safeErrorCode(err)
      );
    }
  }
  const resolution = {
    resolvedAt: new Date().toISOString(),
    resolver,
    employerWins,
  };
  const record = {
    jobId: jobId.toString(),
    persona: persona.ens,
    subdomain: personaLabel,
    ...(existing ?? {}),
    resolution,
  };
  try {
    saveReport(file, record);
  } catch (err) {
    console.error(
      'Failed to write dispute resolution record',
      safeErrorCode(err)
    );
  }
}

export async function main(): Promise<void> {
  if (!path.isAbsolute(STORAGE_ROOT) || !path.isAbsolute(STATE_ROOT))
    throw new Error('VALIDATOR_STATE_PATH_INVALID');
  const args = process.argv.slice(2);
  const inspectJob =
    args.length === 2 && args[0] === '--inspect-job' ? args[1] : undefined;
  if (args.length && inspectJob === undefined)
    throw new Error('VALIDATOR_ARGUMENTS_INVALID');
  const address =
    wallet?.address || process.env.VALIDATOR_ADDRESS || persona.address;
  if (!address) throw new Error('VALIDATOR_ADDRESS_REQUIRED');
  const interval = Number(process.env.VALIDATOR_POLL_MS || 5000);
  if (!Number.isSafeInteger(interval) || interval < 1000 || interval > 60000)
    throw new Error('VALIDATOR_POLL_INTERVAL_INVALID');
  if (!inspectJob) {
    // Old files used an incompatible hash and lack deployment/round scope.
    // Preserve them and require reconciliation, never import their salts blindly.
    const legacy = path.resolve(process.cwd(), 'storage/validation');
    if (fs.existsSync(legacy)) {
      const stat = fs.lstatSync(legacy);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error('VALIDATOR_LEGACY_PATH_UNSAFE');
      if (
        fs
          .readdirSync(legacy)
          .some((name) =>
            new RegExp(`^[0-9]+-${address.toLowerCase()}\\.json$`, 'i').test(
              name
            )
          )
      )
        throw new Error('VALIDATOR_LEGACY_REQUIRES_REVIEW');
    }
    ensurePrivateDirectory(STORAGE_ROOT);
  }
  runtime = await createReviewedValidator({
    provider,
    reader: validation,
    registry,
    signer: inspectJob ? undefined : wallet || undefined,
    validatorAddress: address,
    validatorLabel: personaLabel,
    stateDirectory: STATE_ROOT,
    reportDirectory: STORAGE_ROOT,
    reviewFile: REVIEW_FILE,
    expectedChainId: process.env.CHAIN_ID,
    evaluate: async (jobId) => ({ ...(await evaluateJob(jobId)) }),
    report: (phase, jobId) =>
      console.log(`[validator] ${phase} confirmed job=${jobId}`),
  });
  if (inspectJob) {
    console.log(JSON.stringify(await runtime.inspect(inspectJob), null, 2));
    provider.destroy();
    return;
  }
  STORAGE_ROOT = runtime.reportDirectory;
  ensurePrivateDirectory(STORAGE_ROOT);
  let recovering = false;
  const states = new Map<string, string>();
  async function reconcile() {
    if (recovering || !runtime || !wallet) return;
    recovering = true;
    try {
      const outcomes = await runtime.recover();
      for (const { jobId, status } of outcomes) {
        if (states.get(jobId) !== status)
          console.log(`[validator] job=${jobId} status=${status}`);
        states.set(jobId, status);
      }
      // A reviewer normally admits a job after its selection event. Poll the
      // explicit review file as well, so a missed event cannot strand admission.
      if (REVIEW_FILE) {
        const review = validateReviewFile(readPrivateJson(REVIEW_FILE));
        const jobs = new Set<string>(
          review.decisions.map((entry: { jobId: string }) => entry.jobId)
        );
        for (const jobId of jobs) {
          try {
            const validators = await validation.validators(jobId);
            await runtime.selected(BigInt(jobId), validators);
          } catch (error) {
            console.error(
              `[validator] admission job=${jobId}:`,
              safeErrorCode(error)
            );
          }
        }
      }
    } finally {
      recovering = false;
    }
  }
  await startObservers();
  await reconcile();
  const timer = setInterval(
    () =>
      reconcile().catch((error) =>
        console.error('[validator] recovery:', safeErrorCode(error))
      ),
    interval
  );
  const stop = () => {
    clearInterval(timer);
    provider.destroy();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log(
    `Validator service running (${
      wallet ? 'explicit reviewer admission' : 'observer mode'
    }).`
  );
}

if (require.main === module)
  main().catch((error) => {
    console.error(
      '[validator] startup:',
      error instanceof Error && /^VALIDATOR_[A-Z_]+$/.test(error.message)
        ? error.message
        : safeErrorCode(error)
    );
    provider.destroy();
    process.exitCode = 1;
  });
