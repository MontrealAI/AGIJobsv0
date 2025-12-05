const fs = require('fs');
const path = require('path');
const hre = require('hardhat');
const { artifacts, network } = hre;
const { AGIALPHA } = require('../scripts/constants');

process.env.RPC_URL = 'http://localhost:8545';
process.env.FETCH_TIMEOUT_MS = '5000';
process.env.PORT = '3000';
process.env.STALE_JOB_MS = String(60 * 60 * 1000);
process.env.SWEEP_INTERVAL_MS = String(60 * 1000);

const shouldMockAgialpha = process.env.SKIP_MOCK_AGIALPHA !== '1';

let snapshotId;

before(async function () {
  this.timeout(900000);
  if (!shouldMockAgialpha) {
    snapshotId = await network.provider.send('evm_snapshot');
    return;
  }
  // Load the test utility ERC20 used to stub the AGIALPHA token
  const mockArtifactPath = path.join(
    hre.config.paths.artifacts,
    'contracts',
    'test',
    'MockERC20.sol',
    'MockERC20.json'
  );
      let artifact;
      try {
        artifact = await artifacts.readArtifact(
          'contracts/test/MockERC20.sol:MockERC20'
        );
      } catch (error) {
        if (
          error?.message?.includes('Artifact for contract') ||
          error?.message?.includes('not found')
        ) {
          if (!fs.existsSync(mockArtifactPath)) {
            const originalCompilers = hre.config.solidity.compilers.map((compiler) => ({
              ...compiler,
              settings: { ...compiler.settings },
            }));
            try {
              if (originalCompilers.length > 0) {
                const fastTestCompiler = {
                  ...originalCompilers[0],
                  // Reuse the first configured compiler so we only download and run a single
                  // toolchain when bootstrapping tests that need MockERC20. This keeps the
                  // compilation step leaner without deviating from the project's defaults.
                  settings: { ...originalCompilers[0].settings },
                };
                hre.config.solidity.compilers = [fastTestCompiler];
              }
              await hre.run('compile');
            } finally {
              hre.config.solidity.compilers = originalCompilers;
            }
          }
          artifact = await artifacts.readArtifact(
            'contracts/test/MockERC20.sol:MockERC20'
      );
    } else {
      throw error;
    }
  }
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
