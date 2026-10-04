import { Contract, Interface, JsonRpcProvider, Wallet } from 'ethers';
import type { Log } from 'ethers';

const SELF_PLAY_ARENA_ABI = [
  'event RoundStarted(uint256 indexed roundId, uint256 indexed teacherJobId, address indexed teacher, uint32 difficulty, uint64 startedAt)',
  'function totalRounds() view returns (uint256)',
  'function startRound(uint256 teacherJobId, address teacher, uint32 difficulty) returns (uint256)',
  'function registerStudentJob(uint256 roundId, uint256 jobId, address student)',
  'function registerValidatorJob(uint256 roundId, uint256 jobId, address validator)',
  'function closeRound(uint256 roundId)',
  'function finalizeRound(uint256 roundId, int32 difficultyDelta, address[] slashedValidators, uint256 slashAmount, address slashRecipient)',
] as const;

const arenaInterface = new Interface(SELF_PLAY_ARENA_ABI);
const roundStartedTopic = arenaInterface.getEvent('RoundStarted')!.topicHash;

export function startedRoundId(
  receipt: { logs: ReadonlyArray<Pick<Log, 'address' | 'topics' | 'data'>> },
  arenaAddress: string,
): number {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== arenaAddress.toLowerCase()) continue;
    if (log.topics[0] !== roundStartedTopic) continue;
    const decoded = arenaInterface.parseLog(log);
    if (decoded?.name !== 'RoundStarted') continue;
    const id: unknown = decoded.args[0];
    if (
      typeof id !== 'bigint' ||
      id <= 0n ||
      id > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error('RoundStarted contains an unsupported round identifier');
    }
    return Number(id);
  }
  throw new Error(
    'Confirmed transaction did not emit RoundStarted from the configured arena',
  );
}

export interface SelfPlayArenaClient {
  readonly getTotalRounds: () => Promise<number>;
  readonly startRound: (
    teacherJobId: number,
    teacher: string,
    difficulty: number,
  ) => Promise<number>;
  readonly registerStudent: (
    roundId: number,
    jobId: number,
    student: string,
  ) => Promise<void>;
  readonly registerValidator: (
    roundId: number,
    jobId: number,
    validator: string,
  ) => Promise<void>;
  readonly closeRound: (roundId: number) => Promise<void>;
  readonly finalizeRound: (
    roundId: number,
    difficultyDelta: number,
    slashedValidators: readonly string[],
    slashAmount: bigint,
    slashRecipient?: string,
  ) => Promise<void>;
}

export class OnChainSelfPlayArenaClient implements SelfPlayArenaClient {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly contract: Contract;

  constructor(
    private readonly address: string,
    rpcUrl: string,
    privateKey: string,
  ) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.wallet = new Wallet(privateKey, this.provider);
    this.contract = new Contract(address, SELF_PLAY_ARENA_ABI, this.wallet);
  }

  async getTotalRounds(): Promise<number> {
    const total: unknown = await this.contract
      .getFunction('totalRounds')
      .staticCall();
    if (
      typeof total !== 'bigint' ||
      total < 0n ||
      total > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error(
        'Arena round count exceeds the supported identifier range',
      );
    }
    return Number(total);
  }

  async startRound(
    teacherJobId: number,
    teacher: string,
    difficulty: number,
  ): Promise<number> {
    const startRound = this.contract.getFunction('startRound');
    const tx = await startRound.send(teacherJobId, teacher, difficulty);
    const receipt = await tx.wait();
    if (!receipt) throw new Error('Arena transaction has no confirmed receipt');
    return startedRoundId(receipt, this.address);
  }

  async registerStudent(
    roundId: number,
    jobId: number,
    student: string,
  ): Promise<void> {
    const register = this.contract.getFunction('registerStudentJob');
    const tx = await register.send(roundId, jobId, student);
    await tx.wait();
  }

  async registerValidator(
    roundId: number,
    jobId: number,
    validator: string,
  ): Promise<void> {
    const register = this.contract.getFunction('registerValidatorJob');
    const tx = await register.send(roundId, jobId, validator);
    await tx.wait();
  }

  async closeRound(roundId: number): Promise<void> {
    const close = this.contract.getFunction('closeRound');
    const tx = await close.send(roundId);
    await tx.wait();
  }

  async finalizeRound(
    roundId: number,
    difficultyDelta: number,
    slashedValidators: readonly string[],
    slashAmount: bigint,
    slashRecipient?: string,
  ): Promise<void> {
    const recipient =
      slashRecipient ?? '0x0000000000000000000000000000000000000000';
    const finalize = this.contract.getFunction('finalizeRound');
    const tx = await finalize.send(
      roundId,
      difficultyDelta,
      slashedValidators,
      slashAmount,
      recipient,
    );
    await tx.wait();
  }
}

export class InMemorySelfPlayArenaClient implements SelfPlayArenaClient {
  private rounds = 0;

  restoreRoundCount(count: number): void {
    this.rounds = Math.max(this.rounds, count);
  }

  getTotalRounds(): Promise<number> {
    return Promise.resolve(this.rounds);
  }

  startRound(
    _teacherJobId: number,
    _teacher: string,
    _difficulty: number,
  ): Promise<number> {
    this.rounds += 1;
    return Promise.resolve(this.rounds);
  }

  async registerStudent(
    _roundId: number,
    _jobId: number,
    _student: string,
  ): Promise<void> {}

  async registerValidator(
    _roundId: number,
    _jobId: number,
    _validator: string,
  ): Promise<void> {}

  async closeRound(_roundId: number): Promise<void> {}

  async finalizeRound(
    _roundId: number,
    _difficultyDelta: number,
    _slashedValidators: readonly string[],
    _slashAmount: bigint,
    _slashRecipient?: string,
  ): Promise<void> {}
}
