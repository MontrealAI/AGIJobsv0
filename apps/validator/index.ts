import { EventLog, JsonRpcProvider, Wallet, Contract, ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

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

interface StoredCommit {
  salt: string;
  approve: boolean;
  burnTxHash: string;
  subdomain: string;
  commitHash: string;
  evaluationPath?: string;
  stakeBalance?: string;
  recordedAt: string;
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
const SUBMISSION_FETCH_TIMEOUT_MS = Number(
  process.env.SUBMISSION_FETCH_TIMEOUT_MS || 15_000
);
const SUBMISSION_MAX_BYTES = Number(
  process.env.SUBMISSION_MAX_BYTES || 5_000_000
);
const STORAGE_ROOT = path.resolve(__dirname, '../../storage/validation');

const provider = new JsonRpcProvider(RPC_URL);
const wallet = PRIVATE_KEY ? new Wallet(PRIVATE_KEY, provider) : null;

const VALIDATION_ABI = [
  'event ValidatorsSelected(uint256 indexed jobId, address[] validators)',
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function commitValidation(uint256 jobId, bytes32 commitHash, string subdomain, bytes32[] proof)',
  'function revealValidation(uint256 jobId, bool approve, bytes32 burnTxHash, bytes32 salt, string subdomain, bytes32[] proof)',
];

const REGISTRY_ABI = [
  'event ResultSubmitted(uint256 indexed jobId, address indexed worker, bytes32 resultHash, string resultURI, string subdomain)',
  'event JobDisputed(uint256 indexed jobId, address indexed caller)',
  'event BurnReceiptSubmitted(uint256 indexed jobId, bytes32 burnTxHash, uint256 amount, uint256 blockNumber)',
  'function getSpecHash(uint256 jobId) view returns (bytes32)',
  'function jobs(uint256 jobId) view returns (address employer,address agent,uint128 reward,uint96 stake,uint32 feePct,uint32 agentPct,uint8 state,bool success,bool burnConfirmed,uint128 burnReceiptAmount,uint8 agentTypes,uint64 deadline,uint64 assignedAt,bytes32 uriHash,bytes32 resultHash,bytes32 specHash)',
];

const DISPUTE_ABI = [
  'event DisputeRaised(uint256 indexed jobId, address indexed claimant, bytes32 evidenceHash)',
  'event DisputeResolved(uint256 indexed jobId, address indexed resolver, bool employerWins)',
  'function disputes(uint256 jobId) view returns (tuple(address claimant,uint256 raisedAt,bool resolved,uint256 fee,bytes32 evidenceHash))',
];

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

fs.mkdirSync(STORAGE_ROOT, { recursive: true });

const persona = loadPersona(PERSONA_PATH);
const personaStakeTarget = parseStakeTarget(persona.stakeTarget);
const personaLabel = persona.label;
const validatorAddress = wallet?.address.toLowerCase();

if (wallet && persona.address) {
  const normalizedPersonaAddress = persona.address.toLowerCase();
  if (normalizedPersonaAddress !== validatorAddress) {
    console.warn(
      `Persona address ${normalizedPersonaAddress} does not match wallet ${validatorAddress}. Using wallet address.`
    );
  }
}

if (wallet && !persona.address) {
  persona.address = wallet.address;
}

if (!persona.ens.endsWith('.club.agi.eth')) {
  console.warn(
    `Validator persona ${persona.ens} is expected to use a .club.agi.eth domain.`
  );
}

const submissions = new Map<string, SubmissionRecord>();

function storagePath(jobId: bigint | number, address?: string): string {
  const suffix = address ? `-${address.toLowerCase()}` : '';
  return path.join(STORAGE_ROOT, `${jobId}${suffix}.json`);
}

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

function normaliseUri(uri: string): string {
  if (!uri) return uri;
  if (uri.startsWith('ipfs://')) {
    const pathPart = uri.replace('ipfs://', '');
    if (!IPFS_GATEWAY) {
      return `https://ipfs.io/ipfs/${pathPart}`;
    }
    return `${IPFS_GATEWAY}/${pathPart}`;
  }
  return uri;
}

async function fetchArtifact(uri: string): Promise<{
  bytes: Uint8Array;
  text: string | null;
  contentType: string | null;
}> {
  const target = normaliseUri(uri);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    SUBMISSION_FETCH_TIMEOUT_MS
  );
  try {
    const response = await fetch(target, {
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`status ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (SUBMISSION_MAX_BYTES && bytes.length > SUBMISSION_MAX_BYTES) {
      throw new Error(
        `artifact exceeds maximum size (${bytes.length} > ${SUBMISSION_MAX_BYTES})`
      );
    }
    const contentType = response.headers.get('content-type');
    let text: string | null = null;
    try {
      if (
        contentType?.includes('json') ||
        contentType?.includes('text') ||
        contentType?.includes('csv')
      ) {
        text = new TextDecoder().decode(bytes);
      } else {
        text = new TextDecoder().decode(bytes);
      }
    } catch {
      text = null;
    }
    return { bytes, text, contentType };
  } finally {
    clearTimeout(timer);
  }
}

function persistSubmission(jobId: bigint, record: SubmissionRecord): void {
  try {
    fs.writeFileSync(submissionPath(jobId), JSON.stringify(record, null, 2));
  } catch (err) {
    console.error('Failed to persist submission record', err);
  }
}

function loadSubmission(jobId: bigint): SubmissionRecord | null {
  if (submissions.has(jobId.toString())) {
    return submissions.get(jobId.toString()) ?? null;
  }
  const file = submissionPath(jobId);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as SubmissionRecord;
    submissions.set(jobId.toString(), parsed);
    return parsed;
  } catch (err) {
    console.warn('Failed to load cached submission record', err);
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
  jobId: bigint
): Promise<SubmissionRecord | null> {
  const existing = loadSubmission(jobId);
  if (existing) return existing;
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
    submissions.set(jobId.toString(), record);
    persistSubmission(jobId, record);
    return record;
  } catch (err) {
    console.error('Failed to fetch submission details', err);
    const fallback = loadSubmission(jobId);
    if (fallback) return fallback;
    return null;
  }
}

async function evaluateJob(jobId: bigint): Promise<EvaluationResult> {
  console.log(`Evaluating job ${jobId}`);
  const job = await registry.jobs(jobId);
  const state = Number(job.state ?? job[6] ?? 0);
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
  const resultHash: string = (job.resultHash ??
    job[15] ??
    ethers.ZeroHash) as string;
  const submission = await ensureSubmission(jobId);
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

  if (state < 3) {
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
    console.warn('Failed to query validator stake', err);
    return null;
  }
}

async function getBurnTxHash(jobId: bigint): Promise<string> {
  const filter = registry.filters.BurnReceiptSubmitted(jobId);
  const events = await registry.queryFilter(filter, 0, 'latest');
  if (events.length === 0) return ethers.ZeroHash;
  const evt = events[events.length - 1] as EventLog;
  const args = evt.args as any;
  return (args?.burnTxHash as string) ?? ethers.ZeroHash;
}

async function handleValidatorsSelected(jobId: bigint, validators: string[]) {
  if (!wallet) return;
  const lower = validators.map((v) => v.toLowerCase());
  if (!lower.includes(wallet.address.toLowerCase())) return;
  console.log(
    `Selected as validator for job ${jobId} using ${personaLabel}.club.agi.eth`
  );

  const evaluation = await evaluateJob(jobId);
  const approve = evaluation.approve;
  if (personaStakeTarget && evaluation.stakeBalance) {
    const currentStake = BigInt(evaluation.stakeBalance);
    if (currentStake < personaStakeTarget) {
      console.warn(
        `Validator stake ${ethers.formatUnits(
          currentStake,
          18
        )} below target ${ethers.formatUnits(personaStakeTarget, 18)}.`
      );
    }
  }
  const nonce: bigint = await validation.jobNonce(jobId);
  const specHash: string = await registry.getSpecHash(jobId);
  const burnTxHash: string = await getBurnTxHash(jobId);

  const salt = ethers.hexlify(ethers.randomBytes(32));
  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
    [jobId, nonce, approve, burnTxHash, salt, specHash]
  );

  const writer = validation.connect(wallet) as any;
  const tx = await writer.commitValidation(jobId, commitHash, personaLabel, []);
  await tx.wait();

  const address = wallet.address.toLowerCase();
  const evalFile = evaluationPath(jobId, address);
  try {
    fs.writeFileSync(evalFile, JSON.stringify(evaluation, null, 2));
  } catch (err) {
    console.warn('Failed to persist evaluation report', err);
  }

  const commitRecord: StoredCommit = {
    salt,
    approve,
    burnTxHash,
    subdomain: personaLabel,
    commitHash,
    evaluationPath: evalFile,
    stakeBalance: evaluation.stakeBalance,
    recordedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(
      storagePath(jobId, address),
      JSON.stringify(commitRecord, null, 2)
    );
  } catch (err) {
    console.error('Failed to persist commit record', err);
  }

  console.log(
    `Commit submitted for job ${jobId}: ${approve ? 'approve' : 'reject'} (tx ${
      tx.hash
    })`
  );

  scheduleReveal(jobId);
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
      record.errors = [
        err instanceof Error
          ? err.message
          : 'Failed to fetch submission artifact',
      ];
      console.error('Failed to fetch submission artifact', err);
    }
  }
  submissions.set(jobId.toString(), record);
  persistSubmission(jobId, record);
}

function scheduleReveal(jobId: bigint) {
  const delay = Number(process.env.REVEAL_DELAY_MS || 60000);
  setTimeout(() => {
    reveal(jobId).catch((err) => console.error('Reveal failed', err));
  }, delay);
}

async function reveal(jobId: bigint) {
  if (!wallet) return;
  const address = wallet.address.toLowerCase();
  const file = storagePath(jobId, address);
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as StoredCommit;
  const writer = validation.connect(wallet) as any;
  const tx = await writer.revealValidation(
    jobId,
    data.approve,
    data.burnTxHash,
    data.salt,
    data.subdomain,
    []
  );
  await tx.wait();
  fs.unlinkSync(file);
  console.log(
    `Reveal submitted for job ${jobId} with ${data.subdomain}.club.agi.eth`
  );
}

validation.on('ValidatorsSelected', handleValidatorsSelected);
registry.on(
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
    ).catch((err) => console.error('Failed to process ResultSubmitted', err));
  }
);
registry.on('JobDisputed', (jobId: bigint, caller: string) => {
  console.log(`Job ${jobId} disputed by ${caller}`);
});

if (dispute) {
  dispute.on(
    'DisputeRaised',
    async (jobId: bigint, claimant: string, evidenceHash: string) => {
      console.log(`Dispute raised on job ${jobId} by ${claimant}`);
      const evidence = await fetchEvidence(evidenceHash);
      await respondToDispute(jobId, evidence);
    }
  );
  dispute.on(
    'DisputeResolved',
    async (jobId: bigint, resolver: string, employerWins: boolean) => {
      console.log(
        `Dispute resolved for job ${jobId} by ${resolver}, employerWins=${employerWins}`
      );
      await markDisputeResolution(jobId, resolver, employerWins);
    }
  );
}

async function fetchEvidence(hash: string): Promise<string> {
  const gateway = process.env.EVIDENCE_GATEWAY || 'https://ipfs.io/ipfs/';
  try {
    const res = await fetch(gateway + hash.replace(/^0x/, ''));
    if (!res.ok) throw new Error(`status ${res.status}`);
    return await res.text();
  } catch (err) {
    console.error('Failed to fetch evidence', err);
    return '';
  }
}

async function respondToDispute(jobId: bigint, evidence: string) {
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
        evaluation = JSON.parse(
          fs.readFileSync(evalFile, 'utf8')
        ) as EvaluationResult;
      } catch (err) {
        console.warn('Failed to load evaluation for dispute', err);
      }
    }
  }
  const record = {
    jobId: jobId.toString(),
    persona: persona.ens,
    subdomain: personaLabel,
    timestamp: new Date().toISOString(),
    evidence: parsedEvidence,
    evidenceHash: evidence
      ? ethers.keccak256(ethers.toUtf8Bytes(evidence))
      : null,
    evaluation,
    stance: evaluation
      ? evaluation.approve
        ? 'support-agent'
        : 'support-employer'
      : 'unknown',
  };
  try {
    fs.writeFileSync(disputeFile, JSON.stringify(record, null, 2));
    console.log(`Dispute evidence recorded at ${disputeFile}`);
  } catch (err) {
    console.error('Failed to persist dispute record', err);
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
      existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.warn('Failed to read existing dispute record', err);
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
    fs.writeFileSync(file, JSON.stringify(record, null, 2));
  } catch (err) {
    console.error('Failed to write dispute resolution record', err);
  }
}

console.log('Validator service running...');
