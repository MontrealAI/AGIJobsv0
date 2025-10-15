import { getAddress } from 'ethers';

export type GovernanceActorRole = 'nation' | 'validator' | 'owner';

export interface GovernanceActor {
  id: string;
  role: GovernanceActorRole;
  name: string;
  icon: string;
  mission: string;
  wallet?: string;
}

export interface GovernanceJobBlueprint {
  title: string;
  policyFocus: string;
  rewardAgialpha: string;
  validatorStakeAgialpha: string;
  quorumPercent: number;
  commitWindowHours: number;
  revealWindowHours: number;
  disputeWindowHours: number;
  referenceUri?: string;
}

export interface GovernanceScenarioContext {
  network: string;
  sponsor: GovernanceActor;
  validators: GovernanceActor[];
  owner: GovernanceActor;
  job: GovernanceJobBlueprint;
  connectedActorIds: Set<string>;
}

export type MilestoneStage =
  | 'proposal'
  | 'commit'
  | 'reveal'
  | 'finalize'
  | 'owner';

export interface GovernanceMilestone {
  id: string;
  title: string;
  stage: MilestoneStage;
  summary: string;
  successCriteria: string[];
  promptTemplate: (context: GovernanceScenarioContext) => string;
  ownerCalls?: string[];
}

export const DEFAULT_ACTORS: GovernanceActor[] = [
  {
    id: 'nation-atlantis',
    role: 'nation',
    name: 'Atlantis Federation',
    icon: '🌊',
    mission:
      'Ocean-border nations forming a unified α-AGI treaty bloc with carbon-negative infrastructure and transparent oversight.',
  },
  {
    id: 'nation-solstice',
    role: 'nation',
    name: 'Solstice Concord',
    icon: '🌞',
    mission:
      'Equatorial innovation corridor focused on clean energy, resilient supply chains, and accountable cognitive systems.',
  },
  {
    id: 'nation-northstar',
    role: 'nation',
    name: 'Northstar Coalition',
    icon: '🧭',
    mission:
      'Arctic research alliance safeguarding biosphere-critical data and anchoring planetary defense coordination.',
  },
  {
    id: 'validator-elysium',
    role: 'validator',
    name: 'Elysium Guardians',
    icon: '🛡️',
    mission:
      'Highly capitalised α-AGI validation syndicate operating multi-region staking vaults with 24/7 coverage.',
  },
  {
    id: 'validator-singularity',
    role: 'validator',
    name: 'Singularity Custodians',
    icon: '♾️',
    mission:
      'Deep-tech cooperatives specialising in commit-reveal auditing, quantitative policy simulation, and dispute forensics.',
  },
  {
    id: 'validator-orbit',
    role: 'validator',
    name: 'Orbit Watch',
    icon: '🛰️',
    mission:
      'Off-world validator consortium bridging LEO operators with terrestrial regulators for unstoppable telemetry.',
  },
  {
    id: 'owner-agi',
    role: 'owner',
    name: 'AGI Jobs Guardian Multisig',
    icon: '🧬',
    mission:
      'Sovereign operator authority with the mandate to pause, retune parameters, and steward the α-AGI labour market.',
  },
];

const formatWallet = (actor: GovernanceActor): string => {
  const normalised = normalizeWalletAddress(actor.wallet);
  if (normalised) {
    return normalised;
  }
  if (actor.wallet && actor.wallet.trim().length > 0) {
    return `${actor.wallet.trim()} (unverified)`;
  }
  return 'wallet pending';
};

const describeActorList = (actors: GovernanceActor[]): string =>
  actors
    .map((actor) => `${actor.icon} ${actor.name} — ${formatWallet(actor)}`)
    .join('\n');

export const normalizeWalletAddress = (value?: string | null): string | null => {
  if (!value || value.trim().length === 0) {
    return null;
  }
  try {
    return getAddress(value.trim());
  } catch (error) {
    return null;
  }
};

export const isWalletReady = (actor: GovernanceActor): boolean =>
  normalizeWalletAddress(actor.wallet) !== null;

export const formatNetworkName = (network: string): string => {
  const trimmed = network.trim();
  if (!trimmed) {
    return 'Ethereum mainnet';
  }
  if (/^mainnet$/iu.test(trimmed)) {
    return 'Ethereum mainnet';
  }
  if (/^sepolia$/iu.test(trimmed)) {
    return 'Sepolia testnet';
  }
  return trimmed;
};

const describeConnected = (context: GovernanceScenarioContext): string => {
  const onlineActors = Array.from(context.connectedActorIds.values())
    .map((id) =>
      [context.owner, context.sponsor, ...context.validators].find(
        (actor) => actor.id === id
      )
    )
    .filter((actor): actor is GovernanceActor => Boolean(actor));
  if (onlineActors.length === 0) {
    return 'No actors connected yet.';
  }
  return `Active participants: ${onlineActors
    .map((actor) => `${actor.name} (${formatWallet(actor)})`)
    .join(', ')}.`;
};

const validatorOperations = (
  context: GovernanceScenarioContext,
  command: 'commit' | 'reveal'
): string => {
  const actionLine =
    command === 'commit'
      ? 'validator:cli commit --job-id <JOB_ID> --approve --label <IDENTITY_LABEL>'
      : 'validator:cli reveal --job-id <JOB_ID> --label <IDENTITY_LABEL>';
  return [
    'Coordinate validators via the existing CLI located at scripts/validator/cli.ts.',
    `Run \`npm run validator:cli -- ${actionLine}\` for each validator.`,
    'Use identity records provisioned by `validator:cli identity generate` and stored under storage/validator-cli/.',
    'Ensure every validator signs the transaction from their wallet (hardware or multisig) after reviewing the deterministic spec hash.',
    describeConnected(context),
    'Persist generated salts and receipts; they are required for reveal + dispute workflows.',
  ].join('\n');
};

const ownerCommandDeck = (
  context: GovernanceScenarioContext
): string[] => [
  'npm run owner:command-center -- --network mainnet --config config/owner.mission.json',
  'npm run owner:system-pause -- --network mainnet',
  'npm run owner:update-all -- --network mainnet',
  'npm run owner:atlas -- --network mainnet',
  'npm run owner:parameters -- --network mainnet',
  'npm run owner:mission-control -- --network mainnet',
  `Owner wallet: ${formatWallet(context.owner)}`,
];

export const DEFAULT_MILESTONES: GovernanceMilestone[] = [
  {
    id: 'proposal-blueprint',
    stage: 'proposal',
    title: 'Author unstoppable governance job',
    summary:
      'Model the multinational policy proposal as an AGI Jobs job so validators can ratify or reject it on-chain.',
    successCriteria: [
      'Nation sponsor wallet funds the reward escrow and posting fee.',
      'Spec references full treaty text hosted via IPFS, Arweave, or ENS contenthash.',
      'Owner verifies JobRegistry + StakeManager wiring is healthy before publishing.',
    ],
    promptTemplate: (context) => {
      const { sponsor, validators, owner, job, network } = context;
      return [
        'Construct a Solving α-AGI Governance mission plan using only AGI Jobs v0 (v2) primitives.',
        `Network: ${formatNetworkName(network)}.`,
        `Sponsor: ${sponsor.name} (${formatWallet(sponsor)}).`,
        `Validators: ${describeActorList(validators)}.`,
        `Owner: ${owner.name} (${formatWallet(owner)}).`,
        'Objectives:',
        `• Register a job titled "${job.title}" capturing this policy focus: ${job.policyFocus}`,
        `• Reward pool: ${job.rewardAgialpha} AGIALPHA. Validator stake requirement: ${job.validatorStakeAgialpha} AGIALPHA.`,
        `• Validation quorum: ${job.quorumPercent}% approvals; commit window ${job.commitWindowHours}h; reveal window ${job.revealWindowHours}h; dispute window ${job.disputeWindowHours}h.`,
        job.referenceUri
          ? `• Publish the full specification at ${job.referenceUri}.`
          : '• Upload the full specification to IPFS/Arweave and return the persistent URI.',
        'Ensure the orchestrator outputs deterministic calls against JobRegistry, StakeManager, ValidationModule, and IdentityRegistry with owner-safe rollbacks.',
        'Confirm staking allowances and identity proofs exist before prompting validators.',
      ].join('\n');
    },
  },
  {
    id: 'validator-commit',
    stage: 'commit',
    title: 'Collect validator commits',
    summary:
      'Each validator hashes its decision with a salt and posts it to the ValidationModule using commit-reveal.',
    successCriteria: [
      'All validator wallets stake ≥ required minimum via StakeManager.',
      'Commitments recorded locally and on-chain; salts stored securely for reveal phase.',
      'Identity proofs (ENS / Merkle) verified for every validator.',
    ],
    promptTemplate: (context) => [
      'Initiate validator commit phase for the active governance job.',
      `Sponsor nation: ${context.sponsor.name}.`,
      `Validators: ${describeActorList(context.validators)}.`,
      validatorOperations(context, 'commit'),
      'Only proceed once commit windows and quorum thresholds from ValidationModule are confirmed via owner:dashboard.',
    ].join('\n'),
  },
  {
    id: 'validator-reveal',
    stage: 'reveal',
    title: 'Reveal validator decisions',
    summary:
      'Validators disclose approval or rejection along with salts, enabling deterministic tallying.',
    successCriteria: [
      'Reveal transactions succeed before reveal deadline lapses.',
      'Mismatch handling plan ready (invoke dispute module if inconsistent).',
      'Receipts archived to storage/validator-cli for audit + owner review.',
    ],
    promptTemplate: (context) => [
      'Trigger the reveal phase for every validator who committed.',
      validatorOperations(context, 'reveal'),
      'Cross-check reveal vs commit hashes before finalise. Any mismatch should trigger dispute protocols and owner pause authority.',
    ].join('\n'),
  },
  {
    id: 'finalise-outcome',
    stage: 'finalize',
    title: 'Finalize + distribute rewards',
    summary:
      'Finalize the job outcome; distribute rewards or trigger burn according to AGI Jobs economics.',
    successCriteria: [
      'ValidationModule.finalize called post reveal window with quorum satisfied.',
      'Rewards distributed via StakeManager payout events, visible on Etherscan.',
      'Certificate NFT minted for the accepted proposal, referencing the policy CID.',
    ],
    promptTemplate: (context) => {
      const { validators, job } = context;
      return [
        'Execute ValidationModule.finalize for the job once reveal confirmations succeed.',
        `Validators expected: ${validators.length}. Quorum threshold: ${job.quorumPercent}%.`,
        'If approvals < threshold, orchestrate dispute or resubmission flows via DisputeModule.',
        'On success, settle payouts and surface receipt CID + tx hashes for publication to non-technical observers.',
        'Update the governance journal with validator reasoning and owner endorsements.',
      ].join('\n');
    },
  },
  {
    id: 'owner-oversight',
    stage: 'owner',
    title: 'Owner oversight + emergency controls',
    summary:
      'Owner retains absolute control to tune parameters, pause subsystems, or rotate governance keys.',
    successCriteria: [
      'Owner verifies wiring with `npm run owner:verify-control` and `npm run owner:dashboard`.',
      'Pause + resume rehearsals executed to prove emergency stop authority.',
      'Parameter sweeps logged with change tickets for future audits.',
    ],
    promptTemplate: (context) => [
      'Activate the owner command deck to supervise the Solving α-AGI Governance mission.',
      `Owner authority: ${context.owner.name} (${formatWallet(context.owner)}).`,
      `Sponsor: ${context.sponsor.name}. Validators online: ${context.validators
        .map((actor) => actor.name)
        .join(', ') || 'none'}.`,
      'Ensure the owner executes the following controls as needed:',
      ownerCommandDeck(context).join('\n'),
      'Document every owner action with timestamped receipts and share with the multinational stakeholders.',
    ].join('\n'),
    ownerCalls: [
      'npm run owner:verify-control -- --network mainnet',
      'npm run owner:dashboard -- --network mainnet',
      'npm run owner:system-pause -- --network mainnet',
      'npm run owner:command-center -- --network mainnet',
    ],
  },
];

export function buildMilestonePrompt(
  milestone: GovernanceMilestone,
  context: GovernanceScenarioContext
): string {
  return milestone.promptTemplate(context);
}

export function cloneActors(actors: GovernanceActor[]): GovernanceActor[] {
  return actors.map((actor) => ({ ...actor }));
}

export function sanitiseActors(value: unknown): GovernanceActor[] {
  if (!Array.isArray(value)) {
    return cloneActors(DEFAULT_ACTORS);
  }
  const mapRole = (role: unknown): GovernanceActorRole => {
    if (role === 'nation' || role === 'validator' || role === 'owner') {
      return role;
    }
    return 'validator';
  };
  const filtered = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const candidate = entry as Partial<GovernanceActor>;
      if (!candidate.id || !candidate.name || !candidate.icon || !candidate.mission) {
        return null;
      }
      return {
        id: String(candidate.id),
        role: mapRole(candidate.role),
        name: String(candidate.name),
        icon: String(candidate.icon),
        mission: String(candidate.mission),
        wallet: typeof candidate.wallet === 'string' ? candidate.wallet : undefined,
      } satisfies GovernanceActor;
    })
    .filter((actor): actor is GovernanceActor => Boolean(actor));
  if (filtered.length === 0) {
    return cloneActors(DEFAULT_ACTORS);
  }
  return filtered;
}

export type MilestoneStatus = 'todo' | 'active' | 'done';

export function sanitiseMilestoneState(
  value: unknown
): Record<string, MilestoneStatus> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const entries = Object.entries(value as Record<string, unknown>).map(
    ([id, status]) => {
      if (status === 'todo' || status === 'active' || status === 'done') {
        return [id, status] as const;
      }
      return null;
    }
  );
  return entries.reduce<Record<string, MilestoneStatus>>((acc, entry) => {
    if (!entry) {
      return acc;
    }
    acc[entry[0]] = entry[1];
    return acc;
  }, {});
}

export const DEFAULT_JOB_BLUEPRINT: GovernanceJobBlueprint = {
  title: 'Pan-Regional α-AGI Safeguard Charter',
  policyFocus:
    'Draft and ratify a supranational governance accord guaranteeing transparent oversight, emergency braking, and unstoppable open-audit data exchanges for α-AGI deployments across all member nations.',
  rewardAgialpha: '100000',
  validatorStakeAgialpha: '25000',
  quorumPercent: 67,
  commitWindowHours: 6,
  revealWindowHours: 6,
  disputeWindowHours: 12,
  referenceUri: 'ipfs://QmPolicyCharterCID',
};

export function sanitiseJobBlueprint(value: unknown): GovernanceJobBlueprint {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_JOB_BLUEPRINT };
  }
  const record = value as Partial<GovernanceJobBlueprint>;
  return {
    title: record.title ? String(record.title) : DEFAULT_JOB_BLUEPRINT.title,
    policyFocus: record.policyFocus
      ? String(record.policyFocus)
      : DEFAULT_JOB_BLUEPRINT.policyFocus,
    rewardAgialpha: record.rewardAgialpha
      ? String(record.rewardAgialpha)
      : DEFAULT_JOB_BLUEPRINT.rewardAgialpha,
    validatorStakeAgialpha: record.validatorStakeAgialpha
      ? String(record.validatorStakeAgialpha)
      : DEFAULT_JOB_BLUEPRINT.validatorStakeAgialpha,
    quorumPercent:
      typeof record.quorumPercent === 'number'
        ? record.quorumPercent
        : DEFAULT_JOB_BLUEPRINT.quorumPercent,
    commitWindowHours:
      typeof record.commitWindowHours === 'number'
        ? record.commitWindowHours
        : DEFAULT_JOB_BLUEPRINT.commitWindowHours,
    revealWindowHours:
      typeof record.revealWindowHours === 'number'
        ? record.revealWindowHours
        : DEFAULT_JOB_BLUEPRINT.revealWindowHours,
    disputeWindowHours:
      typeof record.disputeWindowHours === 'number'
        ? record.disputeWindowHours
        : DEFAULT_JOB_BLUEPRINT.disputeWindowHours,
    referenceUri: record.referenceUri
      ? String(record.referenceUri)
      : DEFAULT_JOB_BLUEPRINT.referenceUri,
  };
}
