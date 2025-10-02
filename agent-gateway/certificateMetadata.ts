import { ethers } from 'ethers';
import { getIpfsClient } from './ipfsClient';
import { registry, jobs } from './utils';

const DEFAULT_GATEWAY =
  process.env.CERTIFICATE_IPFS_GATEWAY?.trim() ||
  process.env.IPFS_GATEWAY_URL?.trim() ||
  'https://ipfs.io/ipfs/';

const RAW_MFS_PATH = process.env.CERTIFICATE_MFS_PATH || '/certificates';
const CERTIFICATE_MFS_PATH = normaliseMfsPath(RAW_MFS_PATH);
const CERTIFICATE_IPNS_KEY = process.env.CERTIFICATE_IPNS_KEY?.trim();

const ZERO_HASH = ethers.ZeroHash;

export type SubmissionMethod = 'finalizeJob' | 'submit' | 'none';

export interface JobContext {
  employer?: string;
  agent?: string;
  specUri?: string;
  specHash?: string;
  uriHash?: string;
}

export interface CertificateMetadataInput {
  jobId: string;
  agent: string;
  resultHash: string;
  resultUri?: string;
  resultCid?: string;
  signature?: string;
  success?: boolean;
  submittedAt?: string;
  submissionMethod?: SubmissionMethod;
  txHash?: string;
  job?: JobContext;
}

export interface CertificateMetadataResult {
  uri: string;
  cid: string;
  ipnsName?: string;
  metadata: Record<string, unknown>;
}

interface SlaDetail {
  uri?: string;
  requiresSignature?: boolean;
  title?: string;
  version?: string;
  summary?: string;
  termsHash?: string;
}

function normaliseMfsPath(pathValue: string): string {
  const trimmed = pathValue.trim();
  if (!trimmed) return '/certificates';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const withoutTrailing = withLeading.replace(/\/+$/, '');
  return withoutTrailing.length > 0 ? withoutTrailing : '/certificates';
}

function normaliseJobId(jobId: string): string {
  try {
    return BigInt(jobId).toString();
  } catch {
    return jobId.toString();
  }
}

function normaliseHash(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Result hash is required for certificate metadata');
  }
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  const bytes = ethers.getBytes(prefixed);
  if (bytes.length !== 32) {
    throw new Error('Result hash must be a 32-byte hex string');
  }
  return ethers.hexlify(bytes);
}

function normaliseAddress(value: string): string {
  try {
    return ethers.getAddress(value);
  } catch {
    return value;
  }
}

function normaliseUri(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveResourceUri(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.startsWith('ipfs://')) {
    const path = trimmed.slice('ipfs://'.length).replace(/^ipfs\//, '');
    return `${DEFAULT_GATEWAY}${path}`;
  }
  return trimmed;
}

async function fetchJobSpec(uri?: string): Promise<Record<string, unknown> | null> {
  const resolved = uri ? resolveResourceUri(uri) : undefined;
  if (!resolved) return null;
  try {
    const response = await fetch(resolved);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    if (json && typeof json === 'object') {
      return json as Record<string, unknown>;
    }
  } catch (err) {
    console.warn('Failed to fetch job specification for certificate metadata', err);
  }
  return null;
}

function extractSlaDetail(spec: Record<string, unknown> | null): SlaDetail | undefined {
  if (!spec) return undefined;
  const direct = spec.sla as Record<string, unknown> | undefined;
  const fallback =
    direct ||
    (spec.serviceLevelAgreement as Record<string, unknown> | undefined) ||
    undefined;
  if (!fallback || typeof fallback !== 'object') {
    return undefined;
  }
  const uri = normaliseUri(
    (fallback.uri as string | undefined) ||
      (fallback.url as string | undefined)
  );
  const requiresSignature = Boolean(
    fallback.requiresSignature ?? fallback.signatureRequired ?? fallback.mustSign
  );
  const title = normaliseUri(fallback.title as string | undefined);
  const version = normaliseUri(
    (fallback.version as string | undefined) ||
      (fallback.revision as string | undefined)
  );
  const summary = normaliseUri(
    (fallback.summary as string | undefined) ||
      (fallback.description as string | undefined)
  );
  const termsHash = normaliseUri(
    (fallback.hash as string | undefined) ||
      (fallback.digest as string | undefined)
  );
  return {
    uri,
    requiresSignature,
    title: title ?? undefined,
    version: version ?? undefined,
    summary: summary ?? undefined,
    termsHash: termsHash ?? undefined,
  };
}

async function resolveJobContext(
  jobId: string,
  provided: JobContext | undefined
): Promise<JobContext> {
  const context: JobContext = { ...(provided ?? {}) };

  if (!context.specUri) {
    const cached = jobs.get(jobId);
    if (cached?.uri) {
      context.specUri = cached.uri;
    }
  }
  if (!context.employer || !context.agent || !context.specHash || !context.uriHash) {
    try {
      const chainJob = await (registry as any).jobs(jobId);
      if (chainJob) {
        context.employer = context.employer ?? (chainJob.employer as string);
        context.agent = context.agent ?? (chainJob.agent as string);
        const chainSpecHash = (chainJob.specHash ?? chainJob[7]) as string | undefined;
        if (chainSpecHash) {
          context.specHash = context.specHash ?? chainSpecHash;
        }
        const chainUriHash = (chainJob.uriHash ?? chainJob[5]) as string | undefined;
        if (chainUriHash) {
          context.uriHash = context.uriHash ?? chainUriHash;
        }
      }
    } catch (err) {
      console.warn('Unable to load on-chain job context for certificate metadata', err);
    }
  }

  if (!context.specUri) {
    try {
      const jobIdBigInt = (() => {
        try {
          return BigInt(jobId);
        } catch {
          return undefined;
        }
      })();
      const filter =
        (registry as any).filters?.JobCreated?.(jobIdBigInt ?? jobId) ??
        (jobIdBigInt !== undefined
          ? registry.filters.JobCreated(jobIdBigInt, null, null)
          : registry.filters.JobCreated(null, null, null));
      const events = await registry.queryFilter(filter);
      const latest = events.at(-1);
      if (latest && typeof latest === 'object' && 'args' in latest) {
        const args = (latest as { args?: Record<string, unknown> }).args;
        const uriCandidate =
          (args as { uri?: unknown })?.uri ??
          (args && (args as unknown as Record<number, unknown>)[7]);
        if (typeof uriCandidate === 'string') {
          context.specUri = uriCandidate;
        }
      }
    } catch (err) {
      console.warn('Unable to resolve job specification URI from events', err);
    }
  }

  if (!context.uriHash && context.specUri) {
    try {
      const hash = ethers.keccak256(ethers.toUtf8Bytes(context.specUri));
      context.uriHash = hash;
    } catch (err) {
      console.warn('Failed to compute specification hash for certificate metadata', err);
    }
  }

  return context;
}

async function ensureMfsDirectory(client: any, path: string): Promise<void> {
  try {
    await client.files.mkdir(path, { parents: true });
  } catch (err: any) {
    if (!err || typeof err.code !== 'string') throw err;
    const code = err.code.toLowerCase();
    if (!code.includes('exists')) {
      throw err;
    }
  }
}

export async function publishCertificateMetadata(
  input: CertificateMetadataInput
): Promise<CertificateMetadataResult | null> {
  const jobId = normaliseJobId(input.jobId);
  const agentAddress = normaliseAddress(input.agent);
  const normalizedHash = normaliseHash(input.resultHash);

  if (normalizedHash === ZERO_HASH) {
    console.warn('Skipping certificate metadata publication for zero hash');
    return null;
  }
  if (!input.signature) {
    console.warn('Skipping certificate metadata publication without signature');
    return null;
  }
  if (input.success === false) {
    console.warn('Skipping certificate metadata publication for failed submission');
    return null;
  }

  const jobContext = await resolveJobContext(jobId, input.job);
  const spec = await fetchJobSpec(jobContext.specUri);
  const sla = extractSlaDetail(spec);

  const issuedAt = input.submittedAt ?? new Date().toISOString();
  const metadata: Record<string, unknown> = {
    name: `AGI Jobs Certificate #${jobId}`,
    description: `Tamper-evident completion record for job ${jobId}.`,
    version: '1.0.0',
    issuedAt,
    job: {
      id: jobId,
      employer: jobContext.employer ? normaliseAddress(jobContext.employer) : undefined,
      agent: jobContext.agent ? normaliseAddress(jobContext.agent) : agentAddress,
      specUri: jobContext.specUri,
      specHash: jobContext.specHash,
      uriHash: jobContext.uriHash,
    },
    deliverable: {
      uri: input.resultUri,
      cid: input.resultCid,
      hash: normalizedHash,
      signature: input.signature,
      submittedAt: issuedAt,
      agent: agentAddress,
      txHash: input.txHash,
      method: input.submissionMethod,
    },
    resultHash: normalizedHash,
    deliverableUri: input.resultUri,
    deliverableCid: input.resultCid,
    signature: input.signature,
    signatureAlgorithm: 'eip191',
    signer: agentAddress,
    submissionMethod: input.submissionMethod,
    txHash: input.txHash,
    slaUri: sla?.uri,
    sla: sla,
    proofs: {
      result: {
        hash: normalizedHash,
        signer: agentAddress,
        signature: input.signature,
        uriHash: jobContext.uriHash,
      },
    },
  };

  const payload = JSON.stringify(metadata, null, 2);
  const client = await getIpfsClient();
  const ipfs = client as any;
  const directoryPath = CERTIFICATE_MFS_PATH;
  await ensureMfsDirectory(ipfs, directoryPath);
  const filePath = `${directoryPath}/${jobId}`;
  await ipfs.files.write(filePath, Buffer.from(payload, 'utf8'), {
    create: true,
    truncate: true,
  });
  const fileStat = await ipfs.files.stat(filePath);
  const directoryStat = await ipfs.files.stat(directoryPath);
  const fileCid = fileStat?.cid?.toString?.() ?? directoryStat?.cid?.toString?.();

  let ipnsName: string | undefined;
  if (CERTIFICATE_IPNS_KEY && ipfs.name?.publish) {
    try {
      const publication = await ipfs.name.publish(`/ipfs/${directoryStat.cid}`, {
        key: CERTIFICATE_IPNS_KEY,
        resolve: false,
      });
      ipnsName = publication?.name ?? CERTIFICATE_IPNS_KEY;
    } catch (err) {
      console.warn('Failed to publish certificate metadata IPNS record', err);
    }
  }

  const base = ipnsName ? `ipfs://${ipnsName}/` : `ipfs://${directoryStat.cid}/`;
  const uri = `${base}${jobId}`;

  return {
    uri,
    cid: fileCid ?? directoryStat.cid.toString(),
    ipnsName,
    metadata,
  };
}
