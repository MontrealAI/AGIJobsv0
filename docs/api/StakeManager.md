# StakeManager API

Handles staking, escrow and slashing of the $AGIALPHA token.

## Functions

- `setMinStake(uint256 minStake)` / `setMaxStakePerAddress(uint256 maxStake)` – configure stake limits.
- `setTreasury(address treasury)` / `setFeePool(address feePool)` – wire fee destinations. Treasury must be non-zero and not the governance owner.
- `setJobRegistry(address registry)` / `setDisputeModule(address module)` / `setValidationModule(address module)` – connect modules. Staking reverts until a registry is configured.
- `depositStake(uint8 role, uint256 amount)` – user stakes as agent (`0`) or validator (`1`).
- `withdrawStake(uint8 role, uint256 amount)` – withdraw previously staked tokens.
- `lock(address from, uint256 amount)` / `release(address to, uint256 amount)` – JobRegistry hooks for job rewards.
- `lockDisputeFee(address payer, uint256 amount)` / `payDisputeFee(address to, uint256 amount)` – escrow dispute fees.
- `slash(address user, uint256 amount, address recipient)` – owner slashes stake and sends to recipient. Reverts if `recipient` is the zero address and the employer share is non‑zero.
- `stakeOf(address user, uint8 role)` / `totalStake(uint8 role)` – view functions.

## Events

- `StakeDeposited(address indexed user, Role indexed role, uint256 amount)`
- `StakeWithdrawn(address indexed user, Role indexed role, uint256 amount)`
- `StakeSlashed(address indexed user, uint256 amount, address recipient)`
- `StakeEscrowLocked(bytes32 indexed jobId, address indexed from, uint256 amount)`
- `StakeReleased(bytes32 indexed jobId, address indexed to, uint256 amount)`
- `RewardPaid(bytes32 indexed jobId, address indexed to, uint256 amount)`
- `TokensBurned(bytes32 indexed jobId, uint256 amount)`
- `DisputeFeeLocked(address indexed payer, uint256 amount)`
- `DisputeFeePaid(address indexed to, uint256 amount)`
- `FeePctUpdated(uint256 pct)` / `BurnPctUpdated(uint256 pct)` / `ValidatorRewardPctUpdated(uint256 pct)`
- `ModulesUpdated(address indexed jobRegistry, address indexed disputeModule)`
