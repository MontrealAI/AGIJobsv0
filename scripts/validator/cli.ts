#!/usr/bin/env ts-node

import { promises as fs } from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

type ContractsConfig = {
  agialphaToken: { address: string; abi: string[] };
  stakeManager: { address: string; abi: string[] };
  validationModule: { address: string; abi: string[] };
  jobRegistry: { address: string; abi: string[] };
  disputeModule: { address: string; abi: string[] };
};

type IdentityRecord = {
  label: string;
  ens: string;
  subdomain: string;
  address: string;
  privateKey: string;
  proof?: string[];
  createdAt: string;
  updatedAt: string;
};

type CommitRecord = {
  jobId: string;
  validator: string;
  approve: boolean;
  burnTxHash: string;
  salt: string;
  commitHash: string;
  createdAt: string;
  txHash?: string;
};

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_CONFIG = path.join(ROOT, 'config', 'contracts.orchestrator.json');
const STORAGE_ROOT = path.join(ROOT, 'storage', 'validator-cli');
const IDENTITY_DIR = path.join(STORAGE_ROOT, 'identities');
const COMMIT_DIR = path.join(STORAGE_ROOT, 'commits');

const DEFAULT_RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8545';

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

function normalizeHex(value: string, length = 32): string {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]+$/u.test(trimmed)) {
    throw new Error(`Value ${value} is not valid hex`);
  }
  if (trimmed.length - 2 !== length * 2) {
    throw new Error(`Expected ${length} byte hex string, received ${value}`);
  }
  return trimmed.toLowerCase();
}

function deriveSubdomain(ens: string): string {
  const normalised = ens.trim().toLowerCase();
  if (!normalised.includes('.')) {
    return normalised;
  }
  return normalised.split('.')[0] ?? normalised;
}

async function loadConfig(configPath?: string): Promise<ContractsConfig> {
  const resolved = configPath ? path.resolve(configPath) : DEFAULT_CONFIG;
  return readJson<ContractsConfig>(resolved);
}

function buildProvider(rpc?: string): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(rpc ?? DEFAULT_RPC);
}

async function loadIdentity(label: string): Promise<IdentityRecord> {
  const filePath = path.join(IDENTITY_DIR, `${label}.json`);
  const record = await readJson<IdentityRecord>(filePath);
  return record;
}

async function saveIdentity(record: IdentityRecord): Promise<void> {
  const filePath = path.join(IDENTITY_DIR, `${record.label}.json`);
  record.updatedAt = new Date().toISOString();
  await writeJson(filePath, record);
}

async function listIdentities(): Promise<string[]> {
  try {
    const entries = await fs.readdir(IDENTITY_DIR);
    return entries
      .filter((name) => name.endsWith('.json'))
      .map((file) => file.replace(/\.json$/u, ''));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function saveCommitRecord(
  label: string,
  record: CommitRecord
): Promise<void> {
  const filePath = path.join(COMMIT_DIR, `${label}-${record.jobId}.json`);
  await writeJson(filePath, record);
}

async function loadCommitRecord(
  label: string,
  jobId: string
): Promise<CommitRecord> {
  const filePath = path.join(COMMIT_DIR, `${label}-${jobId}.json`);
  return readJson<CommitRecord>(filePath);
}

async function tryLoadCommitRecord(
  label: string,
  jobId: string
): Promise<CommitRecord | null> {
  try {
    return await loadCommitRecord(label, jobId);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

async function loadProof(proofFile?: string): Promise<string[] | undefined> {
  if (!proofFile) return undefined;
  const value = await readJson<unknown>(path.resolve(proofFile));
  if (!Array.isArray(value)) {
    throw new Error(
      `Proof file ${proofFile} must contain an array of hex strings`
    );
  }
  return value.map((entry) => normalizeHex(String(entry)));
}

function isSigner(
  value: ethers.JsonRpcProvider | ethers.Signer
): value is ethers.Signer {
  return typeof (value as ethers.Signer).getAddress === 'function';
}

async function loadContracts(
  connection: ethers.JsonRpcProvider | ethers.Signer,
  configPath?: string
) {
  const config = await loadConfig(configPath);
  const signer = isSigner(connection) ? connection : undefined;
  const provider = signer?.provider ?? (connection as ethers.JsonRpcProvider);
  if (!provider) {
    throw new Error('A provider is required to load contract handles');
  }
  return {
    provider,
    signer,
    token: new ethers.Contract(
      config.agialphaToken.address,
      config.agialphaToken.abi,
      provider
    ),
    stakeManager: new ethers.Contract(
      config.stakeManager.address,
      config.stakeManager.abi,
      provider
    ),
    validationModule: new ethers.Contract(
      config.validationModule.address,
      config.validationModule.abi,
      provider
    ),
    jobRegistry: new ethers.Contract(
      config.jobRegistry.address,
      config.jobRegistry.abi,
      provider
    ),
    disputeModule: new ethers.Contract(
      config.disputeModule.address,
      config.disputeModule.abi,
      provider
    ),
  };
}

function formatTimestamp(ts: bigint | number): string {
  const value = typeof ts === 'bigint' ? Number(ts) : ts;
  if (!Number.isFinite(value) || value === 0) {
    return 'n/a';
  }
  return new Date(value * 1000).toISOString();
}

async function requireCommitWindow(
  validationModule: ethers.Contract,
  jobId: bigint,
  label: string
): Promise<{ commitDeadline: bigint; revealDeadline: bigint }> {
  const round = await validationModule.rounds(jobId);
  if (!round) {
    throw new Error(`No validation round found for job ${jobId}`);
  }
  const commitDeadline: bigint = round.commitDeadline as bigint;
  const revealDeadline: bigint = round.revealDeadline as bigint;
  if (commitDeadline === 0n) {
    throw new Error(
      `Job ${jobId} has no active commit window for validator ${label}`
    );
  }
  return { commitDeadline, revealDeadline };
}

async function computeCommitHash(
  validationModule: ethers.Contract,
  jobRegistry: ethers.Contract,
  jobId: bigint,
  validator: string,
  approve: boolean,
  burnTxHash: string,
  salt: string
): Promise<{ commitHash: string; nonce: bigint }> {
  const nonce: bigint = await validationModule.jobNonce(jobId);
  const specHash: string = await jobRegistry.getSpecHash(jobId);
  const domainSeparator: string = await validationModule.DOMAIN_SEPARATOR();
  const network = await validationModule.provider.getNetwork();
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const outcomeHash = ethers.keccak256(
    abiCoder.encode(
      ['uint256', 'bytes32', 'bool', 'bytes32'],
      [nonce, specHash, approve, burnTxHash]
    )
  );
  const commitHash = ethers.keccak256(
    abiCoder.encode(
      ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
      [jobId, outcomeHash, salt, validator, network.chainId, domainSeparator]
    )
  );
  return { commitHash, nonce };
}

async function withIdentity<T>(
  label: string,
  action: (identity: IdentityRecord, signer: ethers.Wallet) => Promise<T>,
  rpc?: string
): Promise<T> {
  const identity = await loadIdentity(label);
  const provider = buildProvider(rpc);
  const wallet = new ethers.Wallet(identity.privateKey, provider);
  const result = await action(identity, wallet);
  return result;
}

const cli = yargs(hideBin(process.argv))
  .scriptName('validator-cli')
  .usage('$0 <command> [options]')
  .option('config', {
    describe: 'Path to contracts.orchestrator.json',
    type: 'string',
    global: true,
  })
  .option('rpc', {
    describe: 'JSON-RPC endpoint',
    type: 'string',
    global: true,
  })
  .command(
    'identity generate <label>',
    'Generate a new validator identity keypair',
    (yargsBuilder) =>
      yargsBuilder
        .positional('label', {
          type: 'string',
          demandOption: true,
          describe: 'Local nickname for the validator identity',
        })
        .option('ens', {
          type: 'string',
          demandOption: true,
          describe: 'Full ENS name (e.g. alice.club.agi.eth)',
        })
        .option('proof-file', {
          type: 'string',
          describe: 'Path to JSON array containing the ENS Merkle proof',
        })
        .option('import-key', {
          type: 'string',
          describe: 'Optional hex private key to import instead of generating',
        }),
    async (args) => {
      const label = String(args.label).toLowerCase();
      await ensureDir(IDENTITY_DIR);
      const ens = String(args.ens).toLowerCase();
      const subdomain = deriveSubdomain(ens);
      let wallet: ethers.Wallet;
      if (args['import-key']) {
        wallet = new ethers.Wallet(String(args['import-key']));
      } else {
        wallet = ethers.Wallet.createRandom();
      }
      const proof = await loadProof(args['proof-file']);
      const identity: IdentityRecord = {
        label,
        ens,
        subdomain,
        address: wallet.address,
        privateKey: wallet.privateKey,
        proof,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveIdentity(identity);
      console.log(`Created identity ${label} (${identity.address}) for ${ens}`);
      if (proof) {
        console.log(`Stored ${proof.length} proof elements`);
      }
    }
  )
  .command(
    'identity list',
    'List stored validator identities',
    () => {},
    async () => {
      const labels = await listIdentities();
      if (!labels.length) {
        console.log('No identities found.');
        return;
      }
      for (const label of labels) {
        const identity = await loadIdentity(label);
        console.log(`${label.padEnd(16)} ${identity.address} ${identity.ens}`);
      }
    }
  )
  .command(
    'identity show <label>',
    'Display a stored identity',
    (yargsBuilder) =>
      yargsBuilder.positional('label', {
        type: 'string',
        demandOption: true,
      }),
    async (args) => {
      const record = await loadIdentity(String(args.label).toLowerCase());
      console.log(JSON.stringify(record, null, 2));
    }
  )
  .command(
    'identity set-proof <label> <proofFile>',
    'Attach or update the ENS proof for an identity',
    (yargsBuilder) =>
      yargsBuilder
        .positional('label', { type: 'string', demandOption: true })
        .positional('proofFile', { type: 'string', demandOption: true }),
    async (args) => {
      const label = String(args.label).toLowerCase();
      const proof = await loadProof(String(args.proofFile));
      if (!proof) throw new Error('Proof file produced no data');
      const identity = await loadIdentity(label);
      identity.proof = proof;
      await saveIdentity(identity);
      console.log(`Updated proof for ${label} (${proof.length} elements)`);
    }
  )
  .command(
    'stake deposit <amount>',
    'Deposit validator stake',
    (yargsBuilder) =>
      yargsBuilder
        .positional('amount', { type: 'string', demandOption: true })
        .option('label', { type: 'string', demandOption: true })
        .option('role', {
          type: 'string',
          default: 'validator',
          choices: ['agent', 'validator', 'platform'],
        }),
    async (args) => {
      const label = String(args.label).toLowerCase();
      await withIdentity(
        label,
        async (identity, wallet) => {
          const { token, stakeManager } = await loadContracts(
            wallet,
            args.config as string | undefined
          );
          const decimals: number = await token.decimals();
          const amount = ethers.parseUnits(String(args.amount), decimals);
          const roleMap: Record<string, number> = {
            agent: 0,
            validator: 1,
            platform: 2,
          };
          const role =
            roleMap[String(args.role ?? 'validator').toLowerCase()] ?? 1;
          const allowance: bigint = await token.allowance(
            wallet.address,
            stakeManager.target as string
          );
          if (allowance < amount) {
            const approvalTx = await token
              .connect(wallet)
              .approve(stakeManager.target as string, amount);
            console.log(
              `Approving ${amount.toString()} tokens... ${approvalTx.hash}`
            );
            await approvalTx.wait();
          }
          const depositTx = await stakeManager
            .connect(wallet)
            .depositStake(role, amount);
          console.log(`Depositing stake... ${depositTx.hash}`);
          await depositTx.wait();
          console.log('Stake deposited successfully.');
        },
        args.rpc as string | undefined
      );
    }
  )
  .command(
    'stake withdraw <amount>',
    'Withdraw validator stake',
    (yargsBuilder) =>
      yargsBuilder
        .positional('amount', { type: 'string', demandOption: true })
        .option('label', { type: 'string', demandOption: true })
        .option('role', {
          type: 'string',
          default: 'validator',
          choices: ['agent', 'validator', 'platform'],
        }),
    async (args) => {
      const label = String(args.label).toLowerCase();
      await withIdentity(
        label,
        async (identity, wallet) => {
          const { stakeManager, token } = await loadContracts(
            wallet,
            args.config as string | undefined
          );
          const decimals: number = await token.decimals();
          const amount = ethers.parseUnits(String(args.amount), decimals);
          const roleMap: Record<string, number> = {
            agent: 0,
            validator: 1,
            platform: 2,
          };
          const role =
            roleMap[String(args.role ?? 'validator').toLowerCase()] ?? 1;
          const tx = await stakeManager
            .connect(wallet)
            .withdrawStake(role, amount);
          console.log(`Withdrawing stake... ${tx.hash}`);
          await tx.wait();
          console.log(
            'Withdraw request submitted. Remember to finalize after unbonding.'
          );
        },
        args.rpc as string | undefined
      );
    }
  )
  .command(
    'vote status <jobId>',
    'Inspect validator commit/reveal windows',
    (yargsBuilder) =>
      yargsBuilder
        .positional('jobId', { type: 'string', demandOption: true })
        .option('label', {
          type: 'string',
          describe: 'Optional identity for context',
        }),
    async (args) => {
      const provider = buildProvider(args.rpc as string | undefined);
      const { validationModule } = await loadContracts(
        provider,
        args.config as string | undefined
      );
      const jobId = BigInt(String(args.jobId));
      const round = await validationModule.rounds(jobId);
      console.log(
        `Commit deadline: ${formatTimestamp(round.commitDeadline as bigint)}`
      );
      console.log(
        `Reveal deadline: ${formatTimestamp(round.revealDeadline as bigint)}`
      );
      const failover = await validationModule.failoverStates(jobId);
      if (failover.lastTriggeredAt && failover.lastTriggeredAt !== 0n) {
        console.log(
          `Failover: action=${failover.action} lastTriggered=${formatTimestamp(
            failover.lastTriggeredAt
          )} extensions=${failover.extensions}`
        );
      }
    }
  )
  .command(
    'vote commit <jobId>',
    'Commit a validation vote',
    (yargsBuilder) =>
      yargsBuilder
        .positional('jobId', { type: 'string', demandOption: true })
        .option('label', { type: 'string', demandOption: true })
        .option('approve', { type: 'boolean', default: true })
        .option('burn', {
          type: 'string',
          describe: 'Optional burn receipt hash (0x...)',
        })
        .option('salt', {
          type: 'string',
          describe: 'Optional hex salt for deterministic commits',
        })
        .option('proof-file', {
          type: 'string',
          describe: 'Override proof path',
        }),
    async (args) => {
      const jobId = BigInt(String(args.jobId));
      const label = String(args.label).toLowerCase();
      await withIdentity(
        label,
        async (identity, wallet) => {
          const { validationModule, jobRegistry } = await loadContracts(
            wallet,
            args.config as string | undefined
          );
          const proof =
            (await loadProof(args['proof-file'])) ?? identity.proof ?? [];
          if (!proof.length) {
            console.warn('Warning: submitting vote without ENS proof.');
          }
          const { commitDeadline } = await requireCommitWindow(
            validationModule,
            jobId,
            label
          );
          const latestBlock = await wallet.provider!.getBlock('latest');
          if (latestBlock && BigInt(latestBlock.timestamp) > commitDeadline) {
            console.warn('Commit deadline has passed; transaction may revert.');
          }
          const burnHash = args.burn
            ? normalizeHex(String(args.burn))
            : ethers.ZeroHash;
          const salt = args.salt
            ? normalizeHex(String(args.salt))
            : ethers.hexlify(ethers.randomBytes(32));
          const { commitHash } = await computeCommitHash(
            validationModule,
            jobRegistry,
            jobId,
            wallet.address,
            Boolean(args.approve),
            burnHash,
            salt
          );
          const tx = await validationModule
            .connect(wallet)
            .commitVote(jobId, commitHash, identity.subdomain, proof);
          console.log(`Commit submitted: ${tx.hash}`);
          await tx.wait();
          const record: CommitRecord = {
            jobId: jobId.toString(),
            validator: wallet.address,
            approve: Boolean(args.approve),
            burnTxHash: burnHash,
            salt,
            commitHash,
            createdAt: new Date().toISOString(),
            txHash: tx.hash,
          };
          await saveCommitRecord(label, record);
          console.log(`Stored commit metadata for job ${jobId}`);
        },
        args.rpc as string | undefined
      );
    }
  )
  .command(
    'vote reveal <jobId>',
    'Reveal a previously committed vote',
    (yargsBuilder) =>
      yargsBuilder
        .positional('jobId', { type: 'string', demandOption: true })
        .option('label', { type: 'string', demandOption: true })
        .option('force', {
          type: 'boolean',
          default: false,
          describe:
            'Bypass commit window warning (only use if you know the phase is open)',
        })
        .option('proof-file', {
          type: 'string',
          describe: 'Override proof path',
        }),
    async (args) => {
      const jobId = BigInt(String(args.jobId));
      const label = String(args.label).toLowerCase();
      await withIdentity(
        label,
        async (identity, wallet) => {
          const commit = await tryLoadCommitRecord(label, jobId.toString());
          if (!commit) {
            throw new Error(
              `No stored commit metadata for job ${jobId}. Run vote commit first.`
            );
          }
          const { validationModule } = await loadContracts(
            wallet,
            args.config as string | undefined
          );
          const proof =
            (await loadProof(args['proof-file'])) ?? identity.proof ?? [];
          const { commitDeadline, revealDeadline } = await requireCommitWindow(
            validationModule,
            jobId,
            label
          );
          const latestBlock = await wallet.provider!.getBlock('latest');
          if (latestBlock) {
            const now = BigInt(latestBlock.timestamp);
            if (!args.force && now <= commitDeadline) {
              console.warn(
                'Reveal attempted before commit phase has ended. Use --force to override.'
              );
              return;
            }
            if (now > revealDeadline) {
              console.warn('Reveal window has closed; transaction may revert.');
            }
          }
          const tx = await validationModule
            .connect(wallet)
            .revealVote(
              jobId,
              commit.approve,
              commit.burnTxHash,
              commit.salt,
              identity.subdomain,
              proof
            );
          console.log(`Reveal submitted: ${tx.hash}`);
          await tx.wait();
          console.log('Reveal confirmed on-chain.');
        },
        args.rpc as string | undefined
      );
    }
  )
  .command(
    'challenge raise <jobId>',
    'Raise a dispute or challenge a job result',
    (yargsBuilder) =>
      yargsBuilder
        .positional('jobId', { type: 'string', demandOption: true })
        .option('label', { type: 'string', demandOption: true })
        .option('reason', {
          type: 'string',
          describe: 'Plain-text or URI reason',
        })
        .option('evidence', {
          type: 'string',
          describe: 'Optional evidence hash (hex string) recorded on-chain',
        }),
    async (args) => {
      const jobId = BigInt(String(args.jobId));
      const label = String(args.label).toLowerCase();
      const reason = args.reason ? String(args.reason) : '';
      const evidence = args.evidence
        ? normalizeHex(String(args.evidence))
        : ethers.ZeroHash;
      if (!reason && evidence === ethers.ZeroHash) {
        throw new Error(
          'Provide either --reason or --evidence when raising a challenge.'
        );
      }
      await withIdentity(
        label,
        async (identity, wallet) => {
          const { jobRegistry } = await loadContracts(
            wallet,
            args.config as string | undefined
          );
          let tx;
          if (evidence !== ethers.ZeroHash && reason) {
            tx = await jobRegistry
              .connect(wallet)
              .dispute(jobId, evidence, reason);
          } else if (evidence !== ethers.ZeroHash) {
            tx = await jobRegistry
              .connect(wallet)
              .raiseDispute(jobId, evidence);
          } else {
            tx = await jobRegistry.connect(wallet).raiseDispute(jobId, reason);
          }
          console.log(`Dispute raised: ${tx.hash}`);
          await tx.wait();
        },
        args.rpc as string | undefined
      );
    }
  )
  .command(
    'challenge respond <jobId>',
    'Submit counter-evidence for an active dispute',
    (yargsBuilder) =>
      yargsBuilder
        .positional('jobId', { type: 'string', demandOption: true })
        .option('label', { type: 'string', demandOption: true })
        .option('uri', {
          type: 'string',
          describe: 'URI or plaintext note describing your response',
        })
        .option('evidence', {
          type: 'string',
          describe: 'Keccak256 hash of supporting evidence (0x...)',
        }),
    async (args) => {
      const jobId = BigInt(String(args.jobId));
      const label = String(args.label).toLowerCase();
      const note = args.uri ? String(args.uri) : '';
      const evidenceHash = args.evidence
        ? normalizeHex(String(args.evidence))
        : ethers.ZeroHash;
      if (!note && evidenceHash === ethers.ZeroHash) {
        throw new Error(
          'Provide either --uri or --evidence when responding to a challenge.'
        );
      }
      await withIdentity(
        label,
        async (_identity, wallet) => {
          const { disputeModule } = await loadContracts(
            wallet,
            args.config as string | undefined
          );
          const dispute = await disputeModule.disputes(jobId);
          if (!dispute || dispute.raisedAt === 0n) {
            throw new Error(`No dispute is active for job ${jobId}`);
          }
          if (dispute.resolved) {
            throw new Error(
              `Dispute for job ${jobId} has already been resolved.`
            );
          }
          const tx = await disputeModule
            .connect(wallet)
            .submitEvidence(jobId, evidenceHash, note);
          console.log(`Submitted evidence: ${tx.hash}`);
          await tx.wait();
          console.log('Response recorded on-chain.');
        },
        args.rpc as string | undefined
      );
    }
  )
  .command(
    'challenge status <jobId>',
    'Inspect dispute status for a job',
    (yargsBuilder) =>
      yargsBuilder.positional('jobId', { type: 'string', demandOption: true }),
    async (args) => {
      const provider = buildProvider(args.rpc as string | undefined);
      const { disputeModule } = await loadContracts(
        provider,
        args.config as string | undefined
      );
      const jobId = BigInt(String(args.jobId));
      const dispute = await disputeModule.disputes(jobId);
      if (!dispute || dispute.raisedAt === 0n) {
        console.log(`No dispute active for job ${jobId}`);
        return;
      }
      console.log(`Claimant: ${dispute.claimant}`);
      console.log(`Raised At: ${formatTimestamp(dispute.raisedAt as bigint)}`);
      console.log(`Resolved: ${Boolean(dispute.resolved)}`);
      console.log(`Reason: ${dispute.reason}`);
      console.log(`Evidence Hash: ${dispute.evidenceHash}`);
    }
  )
  .demandCommand(1)
  .strict()
  .help();

cli.parse();
