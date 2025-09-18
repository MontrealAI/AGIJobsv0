import { Contract, JsonRpcProvider, ethers } from 'ethers';
import { ClassificationResult, JobSpec } from './jobClassifier';

export interface SubmissionDetails {
  jobId: string;
  worker: string;
  resultUri: string;
  resultHash: string;
  subdomain?: string;
  blockNumber?: number;
}

export type EvaluationLevel = 'info' | 'warning' | 'error';

export interface EvaluationNote {
  level: EvaluationLevel;
  message: string;
}

export interface EvaluationOutcome {
  approve: boolean;
  confidence: number;
  notes: EvaluationNote[];
  contentLength: number;
  payloadType: 'json' | 'text' | 'binary';
  resultUri?: string;
  resultHash?: string;
  worker?: string;
  subdomain?: string;
  blockNumber?: number;
}

export interface EvaluateSubmissionOptions {
  registry: Contract;
  provider: JsonRpcProvider;
  jobId: bigint;
  classification?: ClassificationResult;
  spec?: JobSpec | null;
  ipfsGateway?: string;
  lookbackBlocks?: number;
  minConfidence?: number;
}

const DEFAULT_LOOKBACK_BLOCKS = Number(
  process.env.VALIDATOR_LOOKBACK_BLOCKS || 200_000
);

const DEFAULT_MIN_CONFIDENCE = Number(
  process.env.VALIDATION_MIN_CONFIDENCE || 0.5
);

function normaliseGatewayUri(uri: string, gateway?: string): string {
  if (!uri) return uri;
  if (uri.startsWith('ipfs://')) {
    const normalizedGateway = (gateway || process.env.IPFS_GATEWAY_URL || '')
      .replace(/\/$/, '')
      .trim();
    const path = uri.replace('ipfs://', '');
    if (normalizedGateway) {
      return `${normalizedGateway}/${path}`;
    }
    return `https://ipfs.io/ipfs/${path}`;
  }
  return uri;
}

async function fetchSubmissionDetails(
  registry: Contract,
  provider: JsonRpcProvider,
  jobId: bigint,
  lookbackBlocks: number
): Promise<SubmissionDetails | null> {
  const filter = registry.filters?.ResultSubmitted
    ? registry.filters.ResultSubmitted(jobId)
    : null;
  if (!filter) {
    return null;
  }
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - lookbackBlocks);
  const events = await registry.queryFilter(filter, fromBlock, latest);
  if (!events.length) {
    return null;
  }
  const entry = events[events.length - 1];
  let worker = ethers.ZeroAddress;
  let resultHash = ethers.ZeroHash;
  let resultURI = '';
  let subdomain: string | undefined;

  if ('args' in entry && Array.isArray(entry.args)) {
    const args = entry.args as unknown[];
    worker = typeof args[1] === 'string' ? args[1] : ethers.ZeroAddress;
    resultHash = typeof args[2] === 'string' ? args[2] : ethers.ZeroHash;
    resultURI = typeof args[3] === 'string' ? args[3] : '';
    subdomain = typeof args[4] === 'string' ? args[4] : undefined;
  } else {
    try {
      const parsed = registry.interface.parseLog(entry);
      const args = parsed?.args ?? [];
      worker = typeof args[1] === 'string' ? args[1] : ethers.ZeroAddress;
      resultHash = typeof args[2] === 'string' ? args[2] : ethers.ZeroHash;
      resultURI = typeof args[3] === 'string' ? args[3] : '';
      subdomain = typeof args[4] === 'string' ? args[4] : undefined;
    } catch {
      // Leave defaults if parsing fails
    }
  }
  return {
    jobId: jobId.toString(),
    worker,
    resultHash,
    resultUri: resultURI,
    subdomain,
    blockNumber: entry.blockNumber,
  };
}

async function downloadArtifact(
  uri: string,
  gateway?: string
): Promise<{ bytes: Uint8Array; text: string | null }> {
  const target = normaliseGatewayUri(uri, gateway);
  const response = await fetch(target, {
    headers: {
      Accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
    },
  });
  if (!response.ok) {
    throw new Error(
      `Unexpected status ${response.status} ${response.statusText}`
    );
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  let text: string | null = null;
  try {
    text = new TextDecoder().decode(buffer);
  } catch {
    text = null;
  }
  return { bytes: buffer, text };
}

function toEvaluation(level: EvaluationLevel, message: string): EvaluationNote {
  return { level, message };
}

function hasMeaningfulHash(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized !== '0x' && normalized !== ethers.ZeroHash;
}

function analyseJsonPayload(
  payload: unknown,
  jobId: string,
  category?: string
): EvaluationNote[] {
  const notes: EvaluationNote[] = [];
  if (!payload || typeof payload !== 'object') {
    notes.push(
      toEvaluation(
        'warning',
        'Result payload decoded as JSON but is not an object.'
      )
    );
    return notes;
  }
  const record = payload as Record<string, unknown>;
  if ('jobId' in record) {
    const expected = jobId;
    const actual = String(record.jobId ?? '');
    if (actual !== expected) {
      notes.push(
        toEvaluation(
          'warning',
          `Result payload jobId ${actual} does not match expected ${expected}.`
        )
      );
    } else {
      notes.push(
        toEvaluation('info', 'Result payload includes matching jobId.')
      );
    }
  } else {
    notes.push(
      toEvaluation(
        'warning',
        'Result payload does not declare the jobId field.'
      )
    );
  }

  if ('type' in record && typeof record.type === 'string') {
    notes.push(
      toEvaluation('info', `Result payload type reported as ${record.type}.`)
    );
  } else {
    notes.push(
      toEvaluation('warning', 'Result payload missing a type identifier.')
    );
  }

  if (category) {
    const normalizedCategory = category.toLowerCase();
    const detected =
      (typeof record.category === 'string' && record.category.toLowerCase()) ||
      (typeof record.stage === 'string' && record.stage.toLowerCase()) ||
      undefined;
    if (detected && detected.includes(normalizedCategory)) {
      notes.push(
        toEvaluation(
          'info',
          `Result payload references category ${detected} matching classification.`
        )
      );
    } else {
      notes.push(
        toEvaluation(
          'warning',
          'Result payload does not reference the classified category explicitly.'
        )
      );
    }
  }

  return notes;
}

export async function evaluateSubmission(
  options: EvaluateSubmissionOptions
): Promise<EvaluationOutcome> {
  const lookback = options.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const notes: EvaluationNote[] = [];
  const checks: boolean[] = [];

  const submission = await fetchSubmissionDetails(
    options.registry,
    options.provider,
    options.jobId,
    lookback
  );

  if (!submission) {
    notes.push(
      toEvaluation(
        'error',
        'No ResultSubmitted event found for the job within the configured lookback window.'
      )
    );
    return {
      approve: false,
      confidence: 0,
      notes,
      contentLength: 0,
      payloadType: 'binary',
    };
  }

  let bytes: Uint8Array = new Uint8Array();
  let text: string | null = null;
  try {
    const artifact = await downloadArtifact(
      submission.resultUri,
      options.ipfsGateway
    );
    bytes = artifact.bytes;
    text = artifact.text;
  } catch (err) {
    notes.push(
      toEvaluation(
        'error',
        `Failed to download result artifact from ${
          submission.resultUri
        }: ${String(err)}`
      )
    );
    return {
      approve: false,
      confidence: 0,
      notes,
      contentLength: 0,
      payloadType: 'binary',
      resultUri: submission.resultUri,
      resultHash: submission.resultHash,
      worker: submission.worker,
      subdomain: submission.subdomain,
      blockNumber: submission.blockNumber,
    };
  }

  const contentLength = bytes.length;
  if (contentLength === 0) {
    notes.push(
      toEvaluation('error', 'Downloaded result artifact is empty (0 bytes).')
    );
    checks.push(false);
  } else {
    notes.push(
      toEvaluation(
        'info',
        `Result artifact size: ${contentLength.toLocaleString()} bytes.`
      )
    );
    checks.push(true);
  }

  if (hasMeaningfulHash(submission.resultHash)) {
    const computedHash = ethers.keccak256(bytes);
    const matches =
      computedHash.toLowerCase() === submission.resultHash.toLowerCase();
    checks.push(matches);
    if (matches) {
      notes.push(
        toEvaluation(
          'info',
          'Result artifact hash matches on-chain resultHash value.'
        )
      );
    } else {
      notes.push(
        toEvaluation(
          'error',
          `Result artifact hash mismatch. Computed ${computedHash} but on-chain reported ${submission.resultHash}.`
        )
      );
    }
  } else {
    notes.push(
      toEvaluation(
        'warning',
        'No meaningful resultHash reported on-chain; skipping hash verification.'
      )
    );
  }

  let payloadType: 'json' | 'text' | 'binary' = 'binary';
  if (text !== null) {
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      try {
        const parsed = JSON.parse(trimmed);
        payloadType = 'json';
        checks.push(true);
        notes.push(
          toEvaluation('info', 'Result artifact parsed successfully as JSON.')
        );
        notes.push(
          ...analyseJsonPayload(
            parsed,
            submission.jobId,
            options.classification?.category
          )
        );
      } catch (err) {
        payloadType = 'text';
        checks.push(false);
        notes.push(
          toEvaluation(
            'warning',
            `Result artifact is textual but not valid JSON: ${String(err)}`
          )
        );
      }
    } else {
      payloadType = 'text';
      checks.push(false);
      notes.push(
        toEvaluation(
          'error',
          'Result artifact is textual but empty after trimming.'
        )
      );
    }
  } else {
    notes.push(
      toEvaluation(
        'warning',
        'Result artifact could not be decoded as text; treating as binary payload.'
      )
    );
  }

  const passedChecks = checks.filter((value) => value).length;
  const totalChecks = checks.length || 1;
  const confidence = passedChecks / totalChecks;
  const hasError = notes.some((note) => note.level === 'error');
  const approve = !hasError && confidence >= minConfidence;

  if (!approve) {
    notes.push(
      toEvaluation(
        'warning',
        `Validator confidence ${confidence.toFixed(
          2
        )} below threshold ${minConfidence}.`
      )
    );
  }

  if (options.spec?.thermodynamics?.maxEnergy) {
    notes.push(
      toEvaluation(
        'info',
        `Spec declared maxEnergy ${options.spec.thermodynamics.maxEnergy}; validator confidence incorporates energy-aware thresholding.`
      )
    );
  }

  return {
    approve,
    confidence,
    notes,
    contentLength,
    payloadType,
    resultUri: submission.resultUri,
    resultHash: submission.resultHash,
    worker: submission.worker,
    subdomain: submission.subdomain,
    blockNumber: submission.blockNumber,
  };
}
