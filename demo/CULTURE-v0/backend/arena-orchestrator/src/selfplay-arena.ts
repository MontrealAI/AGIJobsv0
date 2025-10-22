import { Contract, JsonRpcProvider, Wallet } from 'ethers';

const SELF_PLAY_ARENA_ABI = [
  'function totalRounds() view returns (uint256)',
  'function startRound(uint256 teacherJobId, address teacher, uint32 difficulty) returns (uint256)',
  'function registerStudentJob(uint256 roundId, uint256 jobId, address student)',
  'function registerValidatorJob(uint256 roundId, uint256 jobId, address validator)',
  'function closeRound(uint256 roundId)',
  'function finalizeRound(uint256 roundId, int32 difficultyDelta, address[] slashedValidators, uint256 slashAmount, address slashRecipient)'
] as const;

export interface SelfPlayArenaClient {
  readonly getTotalRounds: () => Promise<number>;
  readonly startRound: (teacherJobId: number, teacher: string, difficulty: number) => Promise<number>;
  readonly registerStudent: (roundId: number, jobId: number, student: string) => Promise<void>;
  readonly registerValidator: (roundId: number, jobId: number, validator: string) => Promise<void>;
  readonly closeRound: (roundId: number) => Promise<void>;
  readonly finalizeRound: (
    roundId: number,
    difficultyDelta: number,
    slashedValidators: readonly string[],
    slashAmount: bigint,
    slashRecipient?: string
  ) => Promise<void>;
}

export class OnChainSelfPlayArenaClient implements SelfPlayArenaClient {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly contract: Contract;

  constructor(
    private readonly address: string,
    rpcUrl: string,
    privateKey: string
  ) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.wallet = new Wallet(privateKey, this.provider);
    this.contract = new Contract(address, SELF_PLAY_ARENA_ABI, this.wallet);
  }

  async getTotalRounds(): Promise<number> {
    const total = await this.contract.totalRounds();
    return Number(total);
  }

  async startRound(teacherJobId: number, teacher: string, difficulty: number): Promise<number> {
    const startRound = this.contract.getFunction('startRound');
    const expected = await startRound.staticCall(teacherJobId, teacher, difficulty);
    const tx = await startRound(teacherJobId, teacher, difficulty);
    await tx.wait();
    return Number(expected);
  }

  async registerStudent(roundId: number, jobId: number, student: string): Promise<void> {
    const register = this.contract.getFunction('registerStudentJob');
    const tx = await register(roundId, jobId, student);
    await tx.wait();
  }

  async registerValidator(roundId: number, jobId: number, validator: string): Promise<void> {
    const register = this.contract.getFunction('registerValidatorJob');
    const tx = await register(roundId, jobId, validator);
    await tx.wait();
  }

  async closeRound(roundId: number): Promise<void> {
    const close = this.contract.getFunction('closeRound');
    const tx = await close(roundId);
    await tx.wait();
  }

  async finalizeRound(
    roundId: number,
    difficultyDelta: number,
    slashedValidators: readonly string[],
    slashAmount: bigint,
    slashRecipient?: string
  ): Promise<void> {
    const recipient = slashRecipient ?? '0x0000000000000000000000000000000000000000';
    const finalize = this.contract.getFunction('finalizeRound');
    const tx = await finalize(roundId, difficultyDelta, slashedValidators, slashAmount, recipient);
    await tx.wait();
  }
}

export class InMemorySelfPlayArenaClient implements SelfPlayArenaClient {
  private rounds = 0;

  async getTotalRounds(): Promise<number> {
    return this.rounds;
  }

  async startRound(_teacherJobId: number, _teacher: string, _difficulty: number): Promise<number> {
    this.rounds += 1;
    return this.rounds;
  }

  async registerStudent(_roundId: number, _jobId: number, _student: string): Promise<void> {}

  async registerValidator(_roundId: number, _jobId: number, _validator: string): Promise<void> {}

  async closeRound(_roundId: number): Promise<void> {}

  async finalizeRound(
    _roundId: number,
    _difficultyDelta: number,
    _slashedValidators: readonly string[],
    _slashAmount: bigint,
    _slashRecipient?: string
  ): Promise<void> {}
}
