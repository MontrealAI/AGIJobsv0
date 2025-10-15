'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { JsonRpcProvider, Signer, ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import {
  createReadOnlyProvider,
  getJobRegistryContract,
  getStakeManagerContract,
  getStakingTokenContract,
  getValidationModuleContract,
  portalConfig,
} from '../lib/contracts';
import { jobStateToPhase } from '../lib/jobStatus';

const ROLE_AGENT = 0;
const ROLE_VALIDATOR = 1;
const STORAGE_SALTS = 'solving-governance.salts.v1';
const STORAGE_BURN = 'solving-governance.burn.v1';
const STORAGE_SPEC = 'solving-governance.spec.v1';
const SUBDOMAIN_AGENT = 'policy-author';
const DEFAULT_VALIDATOR_LABELS = [
  'validator-a',
  'validator-b',
  'validator-c',
  'validator-d',
];

const NATION_PRESETS = [
  {
    id: 'nation-a',
    label: 'Aurora Coalition (Climate Accord)',
    summary:
      'Enact accelerated decarbonisation with AI-governed carbon markets and validator-managed compliance.',
    uri: 'ipfs://solving-alpha/nation-a/climate',
  },
  {
    id: 'nation-b',
    label: 'Horizon League (Trade Charter)',
    summary:
      'Codify autonomous trade dispute mediation and treasury rebalancing for allied economies.',
    uri: 'ipfs://solving-alpha/nation-b/trade',
  },
  {
    id: 'nation-c',
    label: 'Oceanic Union (Biodiversity Pact)',
    summary:
      'Fund marine restoration bonds with validator-audited impact attestations and automatic clawbacks.',
    uri: 'ipfs://solving-alpha/nation-c/biodiversity',
  },
];

type GovernanceJob = {
  jobId: bigint;
  employer: string;
  agent?: string;
  reward: bigint;
  feePct: bigint;
  metadataState: number;
  success?: boolean;
  burnConfirmed?: boolean;
  specHash: string;
  resultHash?: string;
  uriHash?: string;
};

type StoredMap = Record<string, string>;

type StoredSpec = {
  title: string;
  summary: string;
  uri: string;
};

type SpecMap = Record<string, StoredSpec>;

type ActionState = {
  busy: boolean;
  message?: string;
  error?: string;
};

const emptyAction: ActionState = { busy: false };

const isBrowser = typeof window !== 'undefined';

function loadMap(key: string): StoredMap {
  if (!isBrowser) return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn(`Failed to parse local storage map ${key}`, error);
    return {};
  }
}

function persistMap(key: string, value: StoredMap): void {
  if (!isBrowser) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function loadSpecMap(): SpecMap {
  if (!isBrowser) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_SPEC);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SpecMap;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return {};
  } catch (error) {
    console.warn('Failed to load stored spec metadata', error);
    return {};
  }
}

function persistSpecMap(value: SpecMap) {
  if (!isBrowser) return;
  window.localStorage.setItem(STORAGE_SPEC, JSON.stringify(value));
}

function formatAddress(address?: string | null): string {
  if (!address) return '—';
  try {
    const checksummed = ethers.getAddress(address);
    return `${checksummed.slice(0, 6)}…${checksummed.slice(-4)}`;
  } catch {
    return address;
  }
}

function toJobKey(jobId: bigint): string {
  return jobId.toString(10);
}

function computeSpecHash(payload: unknown): string {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload)));
}

function computeResultHash(summary: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(summary.trim()));
}

function computeBurnHash(reference: string): string {
  const trimmed = reference.trim();
  if (!trimmed) {
    throw new Error('Provide a descriptive burn reference.');
  }
  return ethers.keccak256(ethers.toUtf8Bytes(trimmed));
}

function computeCommitHash(
  jobId: bigint,
  nonce: bigint,
  approve: boolean,
  burnHash: string,
  salt: Uint8Array,
  specHash: string
): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [jobId, nonce, approve, burnHash, salt, specHash]
    )
  );
}

function toBytes32(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Provide the original salt used during commit.');
  }
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return ethers.zeroPadValue(prefixed as `0x${string}`, 32);
}

function parseInputBigInt(value: string, decimals: number): bigint {
  if (!value.trim()) {
    throw new Error('Provide a numeric amount.');
  }
  return ethers.parseUnits(value.trim(), decimals);
}

function ensureSigner(
  signer: Signer | undefined,
  action: string
): asserts signer is Signer {
  if (!signer) {
    throw new Error(`Connect a wallet to ${action}.`);
  }
}

function ensureAddress(address: string | undefined, action: string): string {
  if (!address) {
    throw new Error(`Connect a wallet to ${action}.`);
  }
  return address;
}

export function SolvingGovernanceExperience() {
  const { signer, address, connect, disconnect, chainId } = useWeb3();
  const [jobs, setJobs] = useState<GovernanceJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [salts, setSalts] = useState<StoredMap>(() => loadMap(STORAGE_SALTS));
  const [burnHashes, setBurnHashes] = useState<StoredMap>(() => loadMap(STORAGE_BURN));
  const [specs, setSpecs] = useState<SpecMap>(() => loadSpecMap());
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [tokenSymbol, setTokenSymbol] = useState<string>(
    portalConfig.stakingTokenSymbol ?? '$AGIALPHA'
  );
  const [feePct, setFeePct] = useState<bigint>(0n);
  const [ownerAddress, setOwnerAddress] = useState<string>('');
  const [requiredApprovals, setRequiredApprovals] = useState<bigint>(0n);
  const [validatorsPerJob, setValidatorsPerJob] = useState<bigint>(0n);
  const [commitWindow, setCommitWindow] = useState<bigint>(0n);
  const [revealWindow, setRevealWindow] = useState<bigint>(0n);
  const [nationId, setNationId] = useState<string>(NATION_PRESETS[0]?.id ?? '');
  const [nationReward, setNationReward] = useState<string>('5000');
  const [nationDeadlineHours, setNationDeadlineHours] = useState<string>('1');
  const [actionState, setActionState] = useState<ActionState>(emptyAction);
  const [validatorLabel, setValidatorLabel] = useState<string>(
    DEFAULT_VALIDATOR_LABELS[0]
  );
  const [validatorChoice, setValidatorChoice] = useState<'approve' | 'reject'>(
    'approve'
  );
  const [validatorJobId, setValidatorJobId] = useState<string>('');
  const [validatorSaltInput, setValidatorSaltInput] = useState<string>('');
  const [validatorBurnReference, setValidatorBurnReference] = useState<string>('');
  const [policyJobId, setPolicyJobId] = useState<string>('');
  const [policySummary, setPolicySummary] = useState<string>('');
  const [policyResultUri, setPolicyResultUri] = useState<string>('');
  const [burnJobId, setBurnJobId] = useState<string>('');
  const [burnReference, setBurnReference] = useState<string>('');
  const [stakeAmount, setStakeAmount] = useState<string>('250');
  const [stakeRole, setStakeRole] = useState<'agent' | 'validator'>('agent');
  const [entropyJobId, setEntropyJobId] = useState<string>('');
  const [finalizeJobId, setFinalizeJobId] = useState<string>('');
  const [ownerApprovalsInput, setOwnerApprovalsInput] = useState<string>('');
  const [ownerCommitWindowInput, setOwnerCommitWindowInput] = useState<string>('');
  const [ownerRevealWindowInput, setOwnerRevealWindowInput] = useState<string>('');

  const readProvider = useMemo<JsonRpcProvider>(() => createReadOnlyProvider(), []);

  const registryReader = useMemo(
    () => getJobRegistryContract(readProvider),
    [readProvider]
  );
  const validationReader = useMemo(() => {
    return getValidationModuleContract(readProvider);
  }, [readProvider]);

  useEffect(() => {
    async function loadTokenMetadata() {
      try {
        const token = getStakingTokenContract(readProvider);
        if (!token) return;
        const [decimals, symbol] = await Promise.all([
          token.decimals(),
          token.symbol().catch(() => tokenSymbol),
        ]);
        setTokenDecimals(Number(decimals));
        if (typeof symbol === 'string' && symbol.trim()) {
          setTokenSymbol(symbol.trim());
        }
      } catch (error) {
        console.warn('Failed to load staking token metadata', error);
      }
    }
    loadTokenMetadata().catch((error) => console.error(error));
  }, [readProvider, tokenSymbol]);

  const refreshChainInsights = useCallback(async () => {
    try {
      const registry = registryReader;
      const [fee, owner] = await Promise.all([
        registry.feePct(),
        registry.owner(),
      ]);
      setFeePct(BigInt(fee));
      setOwnerAddress(owner);
      if (validationReader) {
        const [approvals, perJob, commit, reveal] = await Promise.all([
          validationReader.requiredValidatorApprovals(),
          validationReader.validatorsPerJob(),
          validationReader.commitWindow(),
          validationReader.revealWindow(),
        ]);
        setRequiredApprovals(BigInt(approvals));
        setValidatorsPerJob(BigInt(perJob));
        setCommitWindow(BigInt(commit));
        setRevealWindow(BigInt(reveal));
      }
    } catch (error) {
      console.warn('Failed to load governance parameters', error);
    }
  }, [registryReader, validationReader]);

  const refreshJobs = useCallback(async () => {
    setLoadingJobs(true);
    setJobsError(null);
    try {
      const registry = registryReader;
      const nextJobId: bigint = await registry.nextJobId();
      const entries: GovernanceJob[] = [];
      for (let i = 1n; i < nextJobId; i += 1n) {
        const job = await registry.jobs(i);
        const metadata = await registry.decodeJobMetadata(job.packedMetadata);
        entries.push({
          jobId: i,
          employer: job.employer,
          agent: job.agent,
          reward: BigInt(job.reward),
          feePct: BigInt(metadata.feePct ?? 0),
          metadataState: Number(metadata.status ?? 0),
          success: Boolean(metadata.success),
          burnConfirmed: Boolean(metadata.burnConfirmed),
          specHash: job.specHash,
          resultHash: job.resultHash,
          uriHash: job.uriHash,
        });
      }
      setJobs(entries);
    } catch (error) {
      console.error('Failed to load jobs', error);
      setJobsError(
        error instanceof Error ? error.message : 'Unable to load governance jobs.'
      );
    } finally {
      setLoadingJobs(false);
    }
  }, [registryReader]);

  useEffect(() => {
    refreshJobs().catch((error) => console.error(error));
    refreshChainInsights().catch((error) => console.error(error));
  }, [refreshJobs, refreshChainInsights]);

  const updateSalts = useCallback((updater: (prev: StoredMap) => StoredMap) => {
    setSalts((prev) => {
      const next = updater(prev);
      persistMap(STORAGE_SALTS, next);
      return next;
    });
  }, []);

  const updateBurnHashes = useCallback(
    (updater: (prev: StoredMap) => StoredMap) => {
      setBurnHashes((prev) => {
        const next = updater(prev);
        persistMap(STORAGE_BURN, next);
        return next;
      });
    },
    []
  );

  const updateSpecs = useCallback((updater: (prev: SpecMap) => SpecMap) => {
    setSpecs((prev) => {
      const next = updater(prev);
      persistSpecMap(next);
      return next;
    });
  }, []);

  const withAction = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setActionState({ busy: true, message: `${label} in progress…` });
      try {
        await fn();
        setActionState({ busy: false, message: `${label} completed.` });
      } catch (error) {
        console.error(`${label} failed`, error);
        setActionState({
          busy: false,
          error: error instanceof Error ? error.message : 'Unexpected error',
        });
      }
    },
    []
  );

  const handleStake = useCallback(async () => {
    await withAction('Stake', async () => {
      ensureSigner(signer, 'stake');
      const caller = ensureAddress(address, 'stake');
      const amount = parseInputBigInt(stakeAmount, tokenDecimals);
      const stakeContract = getStakeManagerContract(signer);
      const tokenContract = getStakingTokenContract(signer);
      if (!stakeContract) {
        throw new Error('StakeManager address is not configured.');
      }
      if (!tokenContract) {
        throw new Error('Staking token address is not configured.');
      }
      const stakeManagerAddress = portalConfig.stakeManagerAddress!;
      const allowance = await tokenContract.allowance(
        caller,
        stakeManagerAddress
      );
      if (allowance < amount) {
        const approveTx = await tokenContract.approve(stakeManagerAddress, amount);
        await approveTx.wait();
      }
      const role = stakeRole === 'agent' ? ROLE_AGENT : ROLE_VALIDATOR;
      const tx = await stakeContract.depositStake(role, amount);
      await tx.wait();
    });
  }, [
    address,
    signer,
    stakeAmount,
    stakeRole,
    tokenDecimals,
    withAction,
  ]);

  const handleCreateJob = useCallback(async () => {
    await withAction('Create governance mission', async () => {
      ensureSigner(signer, 'create jobs');
      const employer = ensureAddress(address, 'create jobs');
      const preset = NATION_PRESETS.find((item) => item.id === nationId);
      if (!preset) {
        throw new Error('Select a nation scenario.');
      }
      const reward = parseInputBigInt(nationReward, tokenDecimals);
      const hours = Number(nationDeadlineHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error('Provide a positive deadline (hours).');
      }
      const deadline = BigInt(
        Math.floor(Date.now() / 1000 + hours * 3600)
      );
      const specPayload = {
        nation: preset.label,
        policy: preset.summary,
        createdAt: new Date().toISOString(),
      };
      const specHash = computeSpecHash(specPayload);
      const registry = getJobRegistryContract(signer);
      const stakeManagerAddress = portalConfig.stakeManagerAddress;
      if (!stakeManagerAddress) {
        throw new Error('StakeManager address missing from configuration.');
      }
      const tokenContract = getStakingTokenContract(signer);
      if (!tokenContract) {
        throw new Error('Staking token address missing.');
      }
      const currentFeePct = feePct;
      const fee = (reward * currentFeePct) / 100n;
      const total = reward + fee;
      const allowance = await tokenContract.allowance(
        employer,
        stakeManagerAddress
      );
      if (allowance < total) {
        const approveTx = await tokenContract.approve(stakeManagerAddress, total);
        await approveTx.wait();
      }
      const tx = await registry.acknowledgeAndCreateJob(
        reward,
        deadline,
        specHash,
        preset.uri
      );
      const receipt = await tx.wait();
      let createdId: bigint | null = null;
      if (receipt?.logs?.length) {
        const iface = registry.interface;
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === 'JobCreated') {
              createdId = BigInt(parsed.args.jobId);
              break;
            }
          } catch {
            continue;
          }
        }
      }
      if (!createdId) {
        const nextId = await registry.nextJobId();
        createdId = BigInt(nextId) - 1n;
      }
      updateSpecs((prev) => ({
        ...prev,
        [toJobKey(createdId!)]: {
          title: preset.label,
          summary: preset.summary,
          uri: preset.uri,
        },
      }));
      await refreshJobs();
    });
  }, [
    address,
    feePct,
    nationDeadlineHours,
    nationId,
    nationReward,
    refreshJobs,
    signer,
    tokenDecimals,
    updateSpecs,
    withAction,
  ]);

  const handleApplyForJob = useCallback(async () => {
    await withAction('Apply as policy author', async () => {
      ensureSigner(signer, 'apply for governance job');
      const jobId = BigInt(policyJobId.trim());
      if (jobId <= 0n) {
        throw new Error('Enter a valid job identifier.');
      }
      const registry = getJobRegistryContract(signer);
      const tx = await registry.applyForJob(jobId, SUBDOMAIN_AGENT, []);
      await tx.wait();
      await refreshJobs();
    });
  }, [policyJobId, refreshJobs, signer, withAction]);

  const handleSubmitPolicy = useCallback(async () => {
    await withAction('Submit policy outcome', async () => {
      ensureSigner(signer, 'submit governance result');
      const jobId = BigInt(policyJobId.trim());
      if (jobId <= 0n) {
        throw new Error('Enter a valid job identifier.');
      }
      const summary = policySummary.trim();
      if (!summary) {
        throw new Error('Add a summary of the negotiated policy.');
      }
      const uri = policyResultUri.trim() || `ipfs://policy/${jobId}`;
      const resultHash = computeResultHash(summary);
      const registry = getJobRegistryContract(signer);
      const tx = await registry.submit(
        jobId,
        resultHash,
        uri,
        SUBDOMAIN_AGENT,
        []
      );
      await tx.wait();
      await refreshJobs();
      updateSpecs((prev) => ({
        ...prev,
        [toJobKey(jobId)]: {
          ...(prev[toJobKey(jobId)] ?? {
            title: `Proposal #${jobId}`,
            summary,
            uri,
          }),
          summary,
          uri,
        },
      }));
    });
  }, [
    policyJobId,
    policyResultUri,
    policySummary,
    refreshJobs,
    signer,
    updateSpecs,
    withAction,
  ]);

  const handleSubmitBurn = useCallback(async () => {
    await withAction('Submit burn receipt', async () => {
      ensureSigner(signer, 'submit burn receipt');
      const jobId = BigInt(burnJobId.trim());
      if (jobId <= 0n) {
        throw new Error('Enter a valid job identifier.');
      }
      const reference = burnReference.trim();
      if (!reference) {
        throw new Error('Describe the burn transaction.');
      }
      const burnHash = computeBurnHash(reference);
      const registry = getJobRegistryContract(signer);
      const tx = await registry.submitBurnReceipt(jobId, burnHash, 0, 0);
      await tx.wait();
      updateBurnHashes((prev) => ({
        ...prev,
        [toJobKey(jobId)]: burnHash,
      }));
    });
  }, [burnJobId, burnReference, signer, updateBurnHashes, withAction]);

  const handleSelectValidators = useCallback(async () => {
    await withAction('Select validators', async () => {
      ensureSigner(signer, 'select validators');
      if (!validationReader) {
        throw new Error('Validation module is not configured.');
      }
      const jobId = BigInt(entropyJobId.trim());
      if (jobId <= 0n) {
        throw new Error('Enter a valid job identifier.');
      }
      const validation = getValidationModuleContract(signer);
      if (!validation) {
        throw new Error('Validation module is not configured.');
      }
      const entropyBytes = ethers.randomBytes(32);
      const entropy = BigInt(ethers.hexlify(entropyBytes));
      const tx = await validation.selectValidators(jobId, entropy);
      await tx.wait();
    });
  }, [entropyJobId, signer, validationReader, withAction]);

  const handleCommitVote = useCallback(async () => {
    await withAction('Commit validator vote', async () => {
      ensureSigner(signer, 'commit vote');
      const voter = ensureAddress(address, 'commit vote');
      const jobId = BigInt(validatorJobId.trim());
      if (jobId <= 0n) {
        throw new Error('Enter a valid job identifier.');
      }
      const storedHash = burnHashes[toJobKey(jobId)];
      const reference = validatorBurnReference.trim();
      const burnHash = storedHash ?? computeBurnHash(reference);
      const specHash = jobs.find((job) => job.jobId === jobId)?.specHash;
      if (!specHash) {
        throw new Error('Unable to read job spec hash. Refresh the job list.');
      }
      const validation = getValidationModuleContract(signer);
      if (!validation) {
        throw new Error('Validation module is not configured.');
      }
      const nonce = await validation.jobNonce(jobId);
      const saltBytes = ethers.randomBytes(32);
      const commitHash = computeCommitHash(
        jobId,
        BigInt(nonce),
        validatorChoice === 'approve',
        burnHash,
        saltBytes,
        specHash
      );
      const tx = await validation.commitValidation(
        jobId,
        commitHash,
        validatorLabel || DEFAULT_VALIDATOR_LABELS[0],
        []
      );
      await tx.wait();
      const saltHex = ethers.hexlify(saltBytes);
      updateSalts((prev) => ({
        ...prev,
        [`${toJobKey(jobId)}:${voter}`]: saltHex,
      }));
      updateBurnHashes((prev) => ({
        ...prev,
        [toJobKey(jobId)]: burnHash,
      }));
      setValidatorSaltInput(saltHex);
    });
  }, [
    address,
    burnHashes,
    jobs,
    signer,
    updateBurnHashes,
    updateSalts,
    validatorBurnReference,
    validatorChoice,
    validatorJobId,
    validatorLabel,
    withAction,
  ]);

  const handleRevealVote = useCallback(async () => {
    await withAction('Reveal validator vote', async () => {
      ensureSigner(signer, 'reveal vote');
      const voter = ensureAddress(address, 'reveal vote');
      const jobId = BigInt(validatorJobId.trim());
      if (jobId <= 0n) {
        throw new Error('Enter a valid job identifier.');
      }
      const saltSource =
        validatorSaltInput.trim() || salts[`${toJobKey(jobId)}:${voter}`];
      if (!saltSource) {
        throw new Error('Provide the original commit salt.');
      }
      const storedHash = burnHashes[toJobKey(jobId)];
      const reference = validatorBurnReference.trim();
      const burnHash = storedHash ?? (reference ? computeBurnHash(reference) : undefined);
      if (!burnHash) {
        throw new Error('Provide the burn reference used during commit.');
      }
      const validation = getValidationModuleContract(signer);
      if (!validation) {
        throw new Error('Validation module is not configured.');
      }
      const tx = await validation.revealValidation(
        jobId,
        validatorChoice === 'approve',
        burnHash,
        toBytes32(saltSource),
        validatorLabel || DEFAULT_VALIDATOR_LABELS[0],
        []
      );
      await tx.wait();
    });
  }, [
    address,
    burnHashes,
    salts,
    signer,
    validatorBurnReference,
    validatorChoice,
    validatorJobId,
    validatorLabel,
    validatorSaltInput,
    withAction,
  ]);

  const handleFinalize = useCallback(async () => {
    await withAction('Finalize validation', async () => {
      ensureSigner(signer, 'finalize validation');
      const jobId = BigInt(finalizeJobId.trim());
      if (jobId <= 0n) {
        throw new Error('Enter a valid job identifier.');
      }
      const validation = getValidationModuleContract(signer);
      if (!validation) {
        throw new Error('Validation module is not configured.');
      }
      const tx = await validation.finalize(jobId);
      await tx.wait();
    });
  }, [finalizeJobId, signer, withAction]);

  const handleEmployerFinalize = useCallback(async () => {
    await withAction('Finalize job settlement', async () => {
      ensureSigner(signer, 'finalize job');
      const jobId = BigInt(finalizeJobId.trim());
      if (jobId <= 0n) {
        throw new Error('Enter a valid job identifier.');
      }
      const burnHash = burnHashes[toJobKey(jobId)];
      if (!burnHash) {
        throw new Error('Submit burn evidence before finalizing.');
      }
      const registry = getJobRegistryContract(signer);
      await (await registry.confirmEmployerBurn(jobId, burnHash)).wait();
      await (await registry.finalize(jobId)).wait();
      await refreshJobs();
    });
  }, [burnHashes, finalizeJobId, refreshJobs, signer, withAction]);

  const isOwner = useMemo(() => {
    if (!address || !ownerAddress) return false;
    try {
      return ethers.getAddress(address) === ethers.getAddress(ownerAddress);
    } catch {
      return false;
    }
  }, [address, ownerAddress]);

  const handlePause = useCallback(async () => {
    await withAction('Pause registry', async () => {
      ensureSigner(signer, 'pause the registry');
      const registry = getJobRegistryContract(signer);
      await (await registry.pause()).wait();
    });
  }, [signer, withAction]);

  const handleUnpause = useCallback(async () => {
    await withAction('Unpause registry', async () => {
      ensureSigner(signer, 'unpause the registry');
      const registry = getJobRegistryContract(signer);
      await (await registry.unpause()).wait();
    });
  }, [signer, withAction]);

  const handleOwnerUpdate = useCallback(async () => {
    await withAction('Update validator governance parameters', async () => {
      ensureSigner(signer, 'update validation parameters');
      const validation = getValidationModuleContract(signer);
      if (!validation) {
        throw new Error('Validation module is not configured.');
      }
      if (ownerApprovalsInput.trim()) {
        const approvals = BigInt(ownerApprovalsInput.trim());
        await (await validation.setRequiredValidatorApprovals(approvals)).wait();
      }
      if (ownerCommitWindowInput.trim()) {
        const seconds = BigInt(ownerCommitWindowInput.trim());
        await (await validation.setCommitWindow(seconds)).wait();
      }
      if (ownerRevealWindowInput.trim()) {
        const seconds = BigInt(ownerRevealWindowInput.trim());
        await (await validation.setRevealWindow(seconds)).wait();
      }
      await refreshChainInsights();
    });
  }, [
    ownerApprovalsInput,
    ownerCommitWindowInput,
    ownerRevealWindowInput,
    refreshChainInsights,
    signer,
    withAction,
  ]);

  return (
    <div className="governance-experience">
      <section className="panel">
        <header>
          <h1>Solving α-AGI Governance</h1>
          <p>
            Coordinate nations, wallet validators, and owner controls on a single
            AGI Jobs deployment. Each action below calls production smart
            contracts—no simulations, no shortcuts.
          </p>
        </header>
        <div className="connection">
          {address ? (
            <>
              <p>
                Connected as <strong>{formatAddress(address)}</strong> on chain{' '}
                {chainId ?? '—'}
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={disconnect}
                disabled={actionState.busy}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button primary"
              onClick={() => connect()}
            >
              Connect Wallet
            </button>
          )}
        </div>
        <dl className="metrics">
          <div>
            <dt>Platform Fee</dt>
            <dd>{feePct.toString()}%</dd>
          </div>
          <div>
            <dt>Required Approvals</dt>
            <dd>{requiredApprovals.toString()}</dd>
          </div>
          <div>
            <dt>Validators per Job</dt>
            <dd>{validatorsPerJob.toString()}</dd>
          </div>
          <div>
            <dt>Commit Window</dt>
            <dd>{commitWindow.toString()} seconds</dd>
          </div>
          <div>
            <dt>Reveal Window</dt>
            <dd>{revealWindow.toString()} seconds</dd>
          </div>
        </dl>
        {actionState.message && !actionState.error && (
          <p className="status ok">{actionState.message}</p>
        )}
        {actionState.error && (
          <p className="status error">{actionState.error}</p>
        )}
      </section>

      <section className="panel">
        <header>
          <h2>1. Nations publish proposals</h2>
          <p>
            Choose a preset scenario, set funding in {tokenSymbol}, and deploy the
            mission to the JobRegistry. The UI handles token allowances and ENS
            identity checks automatically.
          </p>
        </header>
        <div className="form-grid">
          <label>
            Nation Scenario
            <select
              value={nationId}
              onChange={(event) => setNationId(event.target.value)}
              disabled={actionState.busy}
            >
              {NATION_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reward ({tokenSymbol})
            <input
              value={nationReward}
              onChange={(event) => setNationReward(event.target.value)}
              placeholder="5000"
              disabled={actionState.busy}
            />
          </label>
          <label>
            Deadline (hours)
            <input
              value={nationDeadlineHours}
              onChange={(event) => setNationDeadlineHours(event.target.value)}
              placeholder="1"
              disabled={actionState.busy}
            />
          </label>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={handleCreateJob}
          disabled={actionState.busy || !address}
        >
          Publish Proposal
        </button>
      </section>

      <section className="panel">
        <header>
          <h2>2. Policy authors execute the mandate</h2>
          <p>
            Stake once, apply, and submit results to trigger validator review.
            Use the same wallet or coordinate across multiple wallets for a
            multi-actor rehearsal.
          </p>
        </header>
        <div className="form-grid">
          <label>
            Stake Amount ({tokenSymbol})
            <input
              value={stakeAmount}
              onChange={(event) => setStakeAmount(event.target.value)}
              disabled={actionState.busy}
            />
          </label>
          <label>
            Role
            <select
              value={stakeRole}
              onChange={(event) =>
                setStakeRole(event.target.value as 'agent' | 'validator')
              }
              disabled={actionState.busy}
            >
              <option value="agent">Policy Author (Agent)</option>
              <option value="validator">Validator</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={handleStake}
          disabled={actionState.busy || !address}
        >
          Stake Tokens
        </button>
        <div className="form-grid">
          <label>
            Job ID
            <input
              value={policyJobId}
              onChange={(event) => setPolicyJobId(event.target.value)}
              placeholder="1"
              disabled={actionState.busy}
            />
          </label>
          <label>
            Result Summary
            <textarea
              value={policySummary}
              onChange={(event) => setPolicySummary(event.target.value)}
              placeholder="Consensus statement, commitments, funding split…"
              rows={3}
              disabled={actionState.busy}
            />
          </label>
          <label>
            Result URI (optional)
            <input
              value={policyResultUri}
              onChange={(event) => setPolicyResultUri(event.target.value)}
              placeholder="ipfs://..."
              disabled={actionState.busy}
            />
          </label>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            onClick={handleApplyForJob}
            disabled={actionState.busy || !address}
          >
            Apply as Policy Author
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleSubmitPolicy}
            disabled={actionState.busy || !address}
          >
            Submit Policy Outcome
          </button>
        </div>
      </section>

      <section className="panel">
        <header>
          <h2>3. Employer records burn evidence</h2>
          <p>
            Record proof of the burned revenue share. Validators will commit to
            this burn hash, preventing retroactive tampering.
          </p>
        </header>
        <div className="form-grid">
          <label>
            Job ID
            <input
              value={burnJobId}
              onChange={(event) => setBurnJobId(event.target.value)}
              placeholder="1"
              disabled={actionState.busy}
            />
          </label>
          <label>
            Burn Reference
            <input
              value={burnReference}
              onChange={(event) => setBurnReference(event.target.value)}
              placeholder="e.g. tx hash or shared note"
              disabled={actionState.busy}
            />
          </label>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={handleSubmitBurn}
          disabled={actionState.busy || !address}
        >
          Submit Burn Receipt
        </button>
      </section>

      <section className="panel">
        <header>
          <h2>4. Validators commit and reveal</h2>
          <p>
            Each validator commits with a random salt, then reveals once the
            commit window closes. Salts are stored locally per account.
          </p>
        </header>
        <div className="form-grid">
          <label>
            Job ID
            <input
              value={validatorJobId}
              onChange={(event) => setValidatorJobId(event.target.value)}
              placeholder="1"
              disabled={actionState.busy}
            />
          </label>
          <label>
            Validator Label
            <input
              value={validatorLabel}
              onChange={(event) => setValidatorLabel(event.target.value)}
              placeholder="validator-a"
              disabled={actionState.busy}
            />
          </label>
          <label>
            Burn Reference
            <input
              value={validatorBurnReference}
              onChange={(event) =>
                setValidatorBurnReference(event.target.value)
              }
              placeholder="reuse employer reference"
              disabled={actionState.busy}
            />
          </label>
          <label>
            Vote
            <select
              value={validatorChoice}
              onChange={(event) =>
                setValidatorChoice(event.target.value as 'approve' | 'reject')
              }
              disabled={actionState.busy}
            >
              <option value="approve">Approve</option>
              <option value="reject">Reject</option>
            </select>
          </label>
          <label>
            Salt (optional)
            <input
              value={validatorSaltInput}
              onChange={(event) => setValidatorSaltInput(event.target.value)}
              placeholder="auto-filled after commit"
              disabled={actionState.busy}
            />
          </label>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            onClick={handleCommitVote}
            disabled={actionState.busy || !address}
          >
            Commit Vote
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={handleRevealVote}
            disabled={actionState.busy || !address}
          >
            Reveal Vote
          </button>
        </div>
      </section>

      <section className="panel">
        <header>
          <h2>5. Finalize and settle</h2>
          <p>
            Trigger validator selection, finalize once commits are revealed, and
            settle funds after burn confirmation.
          </p>
        </header>
        <div className="form-grid">
          <label>
            Job ID
            <input
              value={finalizeJobId}
              onChange={(event) => {
                setFinalizeJobId(event.target.value);
                setEntropyJobId(event.target.value);
              }}
              placeholder="1"
              disabled={actionState.busy}
            />
          </label>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            onClick={handleSelectValidators}
            disabled={actionState.busy || !address}
          >
            Select Validators
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={handleFinalize}
            disabled={actionState.busy || !address}
          >
            Finalize Validation
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleEmployerFinalize}
            disabled={actionState.busy || !address}
          >
            Settle & Distribute Rewards
          </button>
        </div>
      </section>

      {isOwner && (
        <section className="panel emphasis">
          <header>
            <h2>Owner command console</h2>
            <p>
              Owner {formatAddress(ownerAddress)} may pause the protocol or adjust
              validator thresholds instantly.
            </p>
          </header>
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              onClick={handlePause}
              disabled={actionState.busy}
            >
              Pause Platform
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={handleUnpause}
              disabled={actionState.busy}
            >
              Resume Platform
            </button>
          </div>
          <div className="form-grid">
            <label>
              Required Approvals
              <input
                value={ownerApprovalsInput}
                onChange={(event) => setOwnerApprovalsInput(event.target.value)}
                placeholder={requiredApprovals.toString()}
                disabled={actionState.busy}
              />
            </label>
            <label>
              Commit Window (seconds)
              <input
                value={ownerCommitWindowInput}
                onChange={(event) =>
                  setOwnerCommitWindowInput(event.target.value)
                }
                placeholder={commitWindow.toString()}
                disabled={actionState.busy}
              />
            </label>
            <label>
              Reveal Window (seconds)
              <input
                value={ownerRevealWindowInput}
                onChange={(event) =>
                  setOwnerRevealWindowInput(event.target.value)
                }
                placeholder={revealWindow.toString()}
                disabled={actionState.busy}
              />
            </label>
          </div>
          <button
            type="button"
            className="button primary"
            onClick={handleOwnerUpdate}
            disabled={actionState.busy}
          >
            Apply Governance Update
          </button>
        </section>
      )}

      <section className="panel">
        <header>
          <h2>Live governance registry</h2>
          <p>
            Every job below is on-chain. Switch wallets to impersonate nations,
            validators, or observers. Refresh to pull the latest state.
          </p>
        </header>
        <button
          type="button"
          className="button secondary"
          onClick={() => refreshJobs()}
          disabled={loadingJobs}
        >
          Refresh Jobs
        </button>
        {jobsError && <p className="status error">{jobsError}</p>}
        <table className="jobs">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nation / Title</th>
              <th>Employer</th>
              <th>Agent</th>
              <th>Reward</th>
              <th>Status</th>
              <th>Spec Hash</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7}>{loadingJobs ? 'Loading…' : 'No missions yet.'}</td>
              </tr>
            )}
            {jobs.map((job) => {
              const specMeta = specs[toJobKey(job.jobId)];
              return (
                <tr key={job.jobId.toString()}>
                  <td>{job.jobId.toString()}</td>
                  <td>
                    {specMeta ? (
                      <>
                        <strong>{specMeta.title}</strong>
                        <br />
                        <small>{specMeta.summary}</small>
                      </>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  <td>{formatAddress(job.employer)}</td>
                  <td>{formatAddress(job.agent)}</td>
                  <td>
                    {ethers.formatUnits(job.reward, tokenDecimals)} {tokenSymbol}
                  </td>
                  <td>{jobStateToPhase(job.metadataState)}</td>
                  <td className="mono">{job.specHash}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default SolvingGovernanceExperience;
