const { artifacts, network } = require('hardhat');
const { AGIALPHA } = require('../scripts/constants');

process.env.RPC_URL = 'http://localhost:8545';
process.env.FETCH_TIMEOUT_MS = '5000';
process.env.PORT = '3000';
process.env.STALE_JOB_MS = String(60 * 60 * 1000);
process.env.SWEEP_INTERVAL_MS = String(60 * 1000);

const shouldMockAgialpha = process.env.SKIP_MOCK_AGIALPHA !== '1';

let snapshotId;

before(async function () {
  if (!shouldMockAgialpha) {
    snapshotId = await network.provider.send('evm_snapshot');
    return;
  }
  // Load the test utility ERC20 used to stub the AGIALPHA token
  const artifact = await artifacts.readArtifact(
    'contracts/test/MockERC20.sol:MockERC20'
  );
  await network.provider.send('hardhat_setCode', [
    AGIALPHA,
    artifact.deployedBytecode,
  ]);
  snapshotId = await network.provider.send('evm_snapshot');
});

beforeEach(async function () {
  if (!snapshotId || !shouldMockAgialpha) {
    return;
  }
  await network.provider.send('evm_revert', [snapshotId]);
  snapshotId = await network.provider.send('evm_snapshot');
});
