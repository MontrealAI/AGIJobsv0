import { deriveAllIdentities } from "./config/entities";
import {
  allowlistSnapshot,
  allowlistFingerprint,
  resolveGovernanceParameters,
  resolveDomainBudgets,
} from "./config/defaults";
import type { GovernanceParameters } from "./config/defaults";
import { EventIndexer } from "./subgraph/eventIndexer";
import { StakeManager } from "./stake/stakeManager";
import { ValidatorRegistry } from "./validation/validatorRegistry";
import {
  CommitRevealRound,
  deriveCommitment,
  randomSalt,
  type CommitRevealConfig,
} from "./validation/commitRevealRound";
import type { ValidatorProfile } from "./validation/types";
import { evaluatePseudoVrf } from "./vrf/pseudoVrf";
import { ZkBatchAggregator } from "./zk/zkBatchAggregator";
import { generateJobResults } from "./zk/jobFactory";
import { BudgetOverrunMonitor, UnsafeCallMonitor } from "./sentinel/monitors";
import { Sentinel } from "./sentinel/sentinel";
import { DomainPauseManager } from "./sentinel/domainPauseManager";
import type { Domain } from "./config/entities";
import type { AgentAction } from "./sentinel/types";
import { ensVerifier } from "./identity/ensVerifier";

export interface DemoConfigurationSnapshot {
  readonly governance: ReturnType<CommitRevealRound["getConfig"]>;
  readonly sentinelPauseSlaSeconds: number;
  readonly domainBudgets: Record<Domain, string>;
  readonly jobCount: number;
  readonly roundSeed: string;
}

export interface DemoExecutionResult {
  readonly validatorCount: number;
  readonly committee: readonly ValidatorProfile[];
  readonly finalization: ReturnType<CommitRevealRound["finalize"]>;
  readonly zkProof: ReturnType<ZkBatchAggregator["createProof"]>;
  readonly sentinelAlerts: ReturnType<Sentinel["getAlerts"]>;
  readonly eventLog: ReturnType<EventIndexer["toJSON"]>;
  readonly allowlistFingerprint: string;
  readonly configuration: DemoConfigurationSnapshot;
}

export interface DemoOrchestrationOptions {
  readonly governanceOverrides?: Partial<GovernanceParameters>;
  readonly domainBudgetOverrides?: Partial<Record<Domain, bigint>>;
  readonly jobCount?: number;
  readonly roundSeed?: string;
}

function selectCommittee(
  validators: readonly ValidatorProfile[],
  committeeSize: number,
  seed: string
): ValidatorProfile[] {
  const sorted = [...validators];
  for (let i = sorted.length - 1; i > 0; i -= 1) {
    const hash = parseInt(seed.slice(2 + (i % 32), 6 + (i % 32)), 16);
    const j = hash % (i + 1);
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  }
  return sorted.slice(0, committeeSize);
}

function simulateAgentActions(): AgentAction[] {
  const now = Date.now();
  return [
    {
      agent: allowlistSnapshot.entries.find((entry) =>
        entry.ensName.startsWith("athena")
      )!.address,
      ensName: "athena.agent.agi.eth",
      domain: "deep-research",
      cost: 1_200n * 10n ** 18n,
      call: "computeInvariants()",
      timestamp: now,
    },
    {
      agent: allowlistSnapshot.entries.find((entry) =>
        entry.ensName.startsWith("moneta")
      )!.address,
      ensName: "moneta.agent.agi.eth",
      domain: "defi-risk",
      cost: 1_900n * 10n ** 18n,
      call: "delegatecallSensitive()",
      timestamp: now + 1000,
    },
  ];
}

export async function runDemoOrchestration(
  options: DemoOrchestrationOptions = {}
): Promise<DemoExecutionResult> {
  const indexer = new EventIndexer();
  const stakeManager = new StakeManager(indexer);
  const registry = new ValidatorRegistry(stakeManager, indexer);

  const identities = deriveAllIdentities();
  const validators = identities
    .filter((identity) => identity.role === "validator")
    .map((identity) => registry.register(identity));

  const governanceConfig = resolveGovernanceParameters(
    options.governanceOverrides
  );
  const budgets = resolveDomainBudgets(options.domainBudgetOverrides);
  const jobCount = options.jobCount ?? 1000;
  const roundSeed = options.roundSeed ?? allowlistFingerprint;

  const committeeSize = Math.min(
    governanceConfig.committeeSize,
    validators.length
  );
  const committee = selectCommittee(validators, committeeSize, roundSeed);

  const commitConfig: CommitRevealConfig = {
    quorum: governanceConfig.quorum,
    committeeSize,
    commitDeadlineSeconds: governanceConfig.commitDeadlineSeconds,
    revealDeadlineSeconds: governanceConfig.revealDeadlineSeconds,
    nonRevealSlashBps: governanceConfig.nonRevealSlashBps,
    dishonestSlashBps: governanceConfig.dishonestSlashBps,
  };

  const round = new CommitRevealRound(
    {
      roundId: "round-001",
      jobBatchId: "batch-aurora",
      committee,
      seed: roundSeed,
      config: commitConfig,
    },
    stakeManager,
    indexer
  );

  const entropy = roundSeed;

  const commitSubmissions = await Promise.all(
    committee.map(async (validator, index) => {
      const identity = identities.find(
        (candidate) =>
          candidate.wallet.address.toLowerCase() ===
          validator.address.toLowerCase()
      );
      if (!identity) {
        throw new Error("Validator identity missing");
      }
      const salt = randomSalt(entropy, index + 1);
      const vote: "approve" | "reject" = index === committee.length - 1 ? "reject" : "approve";
      const commitment = deriveCommitment(vote, salt);
      const vrfProof = await evaluatePseudoVrf(
        identity.wallet,
        "round-001",
        entropy
      );
      return {
        validator,
        commitment,
        vrfProof,
        salt,
        vote,
      };
    })
  );

  for (const submission of commitSubmissions) {
    round.submitCommit(submission);
  }

  for (const submission of commitSubmissions.slice(0, commitSubmissions.length - 1)) {
    round.submitReveal({
      validator: submission.validator,
      vote: submission.vote,
      salt: submission.salt,
    });
  }

  const jobResults = generateJobResults(jobCount, "deep-research");
  const aggregator = new ZkBatchAggregator();
  const proof = aggregator.createProof("batch-aurora", jobResults);

  const finalization = round.finalize("approve");
  indexer.recordEvent("ZkBatchFinalized", {
    batchId: proof.batchId,
    digest: proof.digest,
    batchSize: proof.batchSize,
    publicKey: proof.publicKey,
  });

  const pauseManager = new DomainPauseManager(indexer);
  pauseManager.initialize([
    "deep-research",
    "defi-risk",
    "infrastructure",
    "bio-safety",
  ]);

  const sentinel = new Sentinel({
    monitors: [
      new BudgetOverrunMonitor(budgets),
      new UnsafeCallMonitor(),
    ],
    pauseManager,
    indexer,
    pauseSlaSeconds: governanceConfig.sentinelPauseSlaSeconds,
  });

  const actions = simulateAgentActions();
  for (const action of actions) {
    sentinel.ingest(action);
  }

  return {
    validatorCount: validators.length,
    committee,
    finalization,
    zkProof: proof,
    sentinelAlerts: sentinel.getAlerts(),
    eventLog: indexer.toJSON(),
    allowlistFingerprint,
    configuration: {
      governance: round.getConfig(),
      sentinelPauseSlaSeconds: governanceConfig.sentinelPauseSlaSeconds,
      domainBudgets: Object.fromEntries(
        Object.entries(budgets).map(([domain, budget]) => [
          domain,
          budget.toString(),
        ])
      ) as Record<Domain, string>,
      jobCount,
      roundSeed,
    },
  };
}

export function verifyEnsIdentity(address: string, ensName: string, domain: Domain) {
  const entry = allowlistSnapshot.entries.find(
    (candidate) =>
      candidate.address.toLowerCase() === address.toLowerCase() &&
      candidate.ensName.toLowerCase() === ensName.toLowerCase()
  );
  if (!entry) {
    return {
      valid: false,
      reason: "Identity not present in allowlist snapshot",
      root: allowlistSnapshot.root,
    };
  }
  return ensVerifier.verify({
    address,
    ensName,
    role: "validator",
    domain,
    proof: entry.proof,
  });
}
