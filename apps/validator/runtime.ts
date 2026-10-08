import {
  VALIDATION_PROTOCOL_ABI,
  VALIDATION_REGISTRY_ABI,
} from '../../shared/validationProtocol';
import { Contract, Provider, Signer, ethers } from 'ethers';
import path from 'node:path';
import { createHash } from 'node:crypto';

const {
  RevealJournal,
  ValidatorRecoveryError,
  createValidatorRuntime,
  resolveSelection,
} = require('../../examples/agentic/validator-recovery');
const {
  readReviewDecision,
  reviewTemplate,
  writePrivateReport,
} = require('./review-admission.cjs');

export const VALIDATION_ABI = [
  ...VALIDATION_PROTOCOL_ABI,
  'function jobRegistry() view returns (address)',
  'event ValidatorsSelected(uint256 indexed jobId,address[] validators)',
  'event ValidationCommitted(uint256 indexed jobId,address indexed validator,bytes32 commitHash,string subdomain)',
];

export const REGISTRY_ABI = [
  ...VALIDATION_REGISTRY_ABI,
  'event ResultSubmitted(uint256 indexed jobId, address indexed worker, bytes32 resultHash, string resultURI, string subdomain)',
  'event JobDisputed(uint256 indexed jobId, address indexed caller)',
  'function jobs(uint256 jobId) view returns (address employer,address agent,uint128 reward,uint96 stake,uint128 burnReceiptAmount,bytes32 uriHash,bytes32 resultHash,bytes32 specHash,uint256 packedMetadata)',
];

export const DISPUTE_ABI = [
  'event DisputeRaised(uint256 indexed jobId,address indexed claimant,bytes32 indexed evidenceHash,string reason)',
  'event DisputeResolved(uint256 indexed jobId,address indexed resolver,bool employerWins)',
  'function disputes(uint256 jobId) view returns (address claimant,uint256 raisedAt,bool resolved,uint256 fee,bytes32 evidenceHash,string reason)',
];

export interface ReviewContext {
  scope: { chainId: string; validationModule: string; validator: string };
  selection: { blockNumber: number; blockHash: string; logIndex: number };
  jobId: string;
  nonce: string;
  specHash: string;
  blockNumber?: number;
  approve?: boolean;
}

export interface ValidatorServiceOptions {
  provider: Provider;
  reader: Contract;
  registry: Contract;
  signer?: Signer;
  validatorAddress: string;
  validatorLabel: string;
  stateDirectory: string;
  reportDirectory: string;
  reviewFile?: string;
  expectedChainId?: string;
  evaluate: (
    jobId: bigint
  ) => Promise<{ approve: boolean; [key: string]: unknown }>;
  report?: (phase: string, jobId: string) => void;
  confirmationTimeoutMs?: number;
}

function fail(code: string): never {
  throw new ValidatorRecoveryError(code);
}

/** Explicit review admission is separate from transport integrity heuristics. */
export async function createReviewedValidator(
  options: ValidatorServiceOptions
) {
  const { provider, reader, registry } = options;
  const network = await provider.getNetwork();
  const registryAddress = await registry.getAddress();
  if (
    options.expectedChainId !== undefined &&
    (!/^[1-9][0-9]*$/.test(options.expectedChainId) ||
      options.expectedChainId !== String(network.chainId))
  )
    fail('VALIDATOR_CHAIN_MISMATCH');
  if (
    !ethers.isAddress(options.validatorAddress) ||
    options.validatorAddress === ethers.ZeroAddress ||
    !/^[a-z0-9-]{1,63}$/.test(options.validatorLabel)
  )
    fail('VALIDATOR_IDENTITY_INVALID');
  if (
    (await reader.jobRegistry()).toLowerCase() !== registryAddress.toLowerCase()
  )
    fail('VALIDATOR_REGISTRY_MISMATCH');
  if (
    options.signer &&
    (await options.signer.getAddress()).toLowerCase() !==
      options.validatorAddress.toLowerCase()
  )
    fail('VALIDATOR_IDENTITY_MISMATCH');
  const scope = {
    chainId: String(network.chainId),
    validationModule: (await reader.getAddress()).toLowerCase(),
    validator: options.validatorAddress.toLowerCase(),
  };
  const reportDirectory = path.join(
    options.reportDirectory,
    createHash('sha256')
      .update(
        JSON.stringify({ ...scope, jobRegistry: registryAddress.toLowerCase() })
      )
      .digest('hex')
  );
  async function assertDeployment() {
    if (String((await provider.getNetwork()).chainId) !== scope.chainId)
      fail('VALIDATOR_CHAIN_CHANGED');
    if (
      (await reader.jobRegistry()).toLowerCase() !==
      registryAddress.toLowerCase()
    )
      fail('VALIDATOR_REGISTRY_MISMATCH');
  }

  async function decision(context: ReviewContext) {
    const job = await registry.jobs(
      context.jobId,
      context.blockNumber === undefined ? {} : { blockTag: context.blockNumber }
    );
    // A review cannot authorize an unsubmitted or already settled job.
    if ((BigInt(job.packedMetadata) & 7n) !== 3n) return null;
    return readReviewDecision(
      options.reviewFile,
      context,
      registryAddress,
      job.resultHash
    );
  }

  async function inspect(jobId: string) {
    await assertDeployment();
    if (!/^[1-9][0-9]*$/.test(jobId) || BigInt(jobId) >= 1n << 256n)
      fail('VALIDATOR_JOB_ID_INVALID');
    const block = await provider.getBlock('latest');
    if (!block) fail('VALIDATOR_BLOCK_UNAVAILABLE');
    const selection = await resolveSelection(
      reader,
      provider,
      jobId,
      scope.validator,
      block.number
    );
    const [nonce, specHash, job] = await Promise.all([
      reader.jobNonce(jobId, { blockTag: block.number }),
      registry.getSpecHash(jobId, { blockTag: block.number }),
      registry.jobs(jobId, { blockTag: block.number }),
    ]);
    if (
      (BigInt(job.packedMetadata) & 7n) !== 3n ||
      job.resultHash === ethers.ZeroHash
    )
      fail('VALIDATOR_SUBMISSION_REQUIRED');
    return reviewTemplate(
      { scope, selection, jobId, nonce: String(nonce), specHash },
      registryAddress,
      job.resultHash
    );
  }

  // Inspection and observer mode create no secret journal and cannot broadcast.
  if (!options.signer)
    return {
      inspect,
      reportDirectory,
      selected: async () => 'observer',
      recover: async () => [],
    };
  if (
    !path.isAbsolute(options.stateDirectory) ||
    !path.isAbsolute(options.reportDirectory)
  )
    fail('VALIDATOR_STATE_PATH_INVALID');
  const journal = new RevealJournal(
    path.join(options.stateDirectory, registryAddress.toLowerCase()),
    scope
  );
  journal.records();
  const runtime: {
    selected(
      jobId: bigint | string,
      validators: string[]
    ): Promise<string | undefined>;
    recover(): Promise<Array<{ jobId: string; status: string }>>;
  } = createValidatorRuntime({
    journal,
    reader,
    writer: reader.connect(options.signer),
    registry,
    provider,
    validatorLabel: options.validatorLabel,
    assertDeployment,
    confirmationTimeoutMs: options.confirmationTimeoutMs,
    report: options.report,
    decide: async (context: ReviewContext) => {
      const admitted = await decision(context);
      if (!admitted) return null;
      const evaluation = await options.evaluate(BigInt(context.jobId));
      if (admitted.approve && evaluation.approve !== true)
        fail('VALIDATOR_REVIEW_ARTIFACT_MISMATCH');
      writePrivateReport(
        reportDirectory,
        `${context.jobId}-${scope.validator}-evaluation.json`,
        {
          ...evaluation,
          suggestedApprove: evaluation.approve,
          approve: admitted.approve,
          review: admitted,
          scope,
          independentAcceptanceClaimed: false,
        }
      );
      return admitted.approve;
    },
    // Revocation also blocks a prepared but never-broadcast vote after restart.
    // A mined or uncertain commitment retains its original reveal material.
    authorizeCommit: async (record: ReviewContext) => {
      const admitted = await decision(record);
      return admitted !== null && admitted.approve === record.approve;
    },
  });
  let tail: Promise<unknown> = Promise.resolve();
  let queued = 0;
  function serial<T>(work: () => Promise<T>): Promise<T> {
    if (queued >= 64)
      return Promise.reject(new ValidatorRecoveryError('VALIDATOR_QUEUE_FULL'));
    queued++;
    const next = tail.then(work);
    tail = next
      .then(
        () => undefined,
        () => undefined
      )
      .finally(() => {
        queued--;
      });
    return next;
  }
  return {
    inspect,
    reportDirectory,
    selected: (jobId: bigint | string, validators: string[]) =>
      serial(() => runtime.selected(jobId, validators)),
    recover: () => serial(() => runtime.recover()),
  };
}
