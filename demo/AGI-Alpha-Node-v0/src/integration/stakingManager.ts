import { Contract, JsonRpcProvider, Wallet, formatUnits, parseUnits } from 'ethers';

import { createLogger } from '../utils/telemetry.js';

const logger = createLogger('staking-manager');

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)'
];

const INCENTIVES_ABI = [
  'function stakeAndActivate(uint256 amount) external',
  'event Activated(address indexed operator, uint256 amount)'
];

const STAKE_MANAGER_ABI = ['function activeStake(address operator) external view returns (uint256)'];

export interface StakingManagerConfig {
  providerUrl: string;
  platformIncentives: string;
  stakeManager: string;
  tokenAddress: string;
  minimumStake: string;
  signerPrivateKey: string;
}

export interface StakeActivationResult {
  success: boolean;
  txHash?: string;
  stakedAmount?: string;
  error?: string;
}

export class StakingManager {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly config: StakingManagerConfig;
  private readonly token: Contract;
  private readonly incentives: Contract;
  private readonly stakeManager: Contract;

  constructor(config: StakingManagerConfig) {
    this.provider = new JsonRpcProvider(config.providerUrl);
    this.wallet = new Wallet(config.signerPrivateKey, this.provider);
    this.config = config;
    this.token = new Contract(config.tokenAddress, ERC20_ABI, this.wallet);
    this.incentives = new Contract(config.platformIncentives, INCENTIVES_ABI, this.wallet);
    this.stakeManager = new Contract(config.stakeManager, STAKE_MANAGER_ABI, this.wallet);
  }

  async hasSufficientStake(amount: string): Promise<boolean> {
    const current = await this.stakeManager.activeStake(this.wallet.address);
    return current >= parseUnits(amount, 18);
  }

  async ensureAllowance(amount: string): Promise<void> {
    const allowance = await this.token.allowance(this.wallet.address, this.config.platformIncentives);
    const parsedAmount = parseUnits(amount, 18);
    if (allowance >= parsedAmount) {
      logger.info('Existing allowance sufficient');
      return;
    }
    const tx = await this.token.approve(this.config.platformIncentives, parsedAmount);
    logger.info({ hash: tx.hash }, 'Approving token allowance');
    await tx.wait();
  }

  async stakeAndActivate(amount: string): Promise<StakeActivationResult> {
    try {
      await this.ensureAllowance(amount);
      const tx = await this.incentives.stakeAndActivate(parseUnits(amount, 18));
      logger.info({ hash: tx.hash }, 'Stake and activate transaction submitted');
      const receipt = await tx.wait();
      const activatedEvent = receipt?.logs
        ?.map((log) => {
          try {
            return this.incentives.interface.parseLog(log);
          } catch (error) {
            logger.debug({ error }, 'Failed to parse log, skipping');
            return null;
          }
        })
        .find((entry) => entry?.name === 'Activated');

      const stakedAmount = activatedEvent?.args?.amount
        ? formatUnits(activatedEvent.args.amount, 18)
        : amount;

      return {
        success: true,
        txHash: tx.hash,
        stakedAmount
      };
    } catch (error) {
      logger.error({ error }, 'Stake and activation failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
