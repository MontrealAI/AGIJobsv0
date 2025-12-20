import '@nomicfoundation/hardhat-toolbox';
import 'hardhat-contract-sizer';
import 'solidity-coverage';
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from 'hardhat/builtin-tasks/task-names';
import { subtask } from 'hardhat/config';
import type { HardhatUserConfig } from 'hardhat/config';
import type { SolcBuild } from 'hardhat/types';

const SOLIDITY_VERSION = '0.8.25';
const LOCAL_SOLC_JS_PATH = require.resolve('solc/soljson.js');

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(
  async ({ solcVersion }: { solcVersion: string }, _hre, runSuper) => {
    if (solcVersion !== SOLIDITY_VERSION) {
      return runSuper({ solcVersion });
    }

    const localSolc = require('solc');
    const localVersion: string = typeof localSolc.version === 'function' ? localSolc.version() : SOLIDITY_VERSION;
    const normalizedVersion = localVersion.startsWith(SOLIDITY_VERSION) ? localVersion : `solc-js-${SOLIDITY_VERSION}`;

    const build: SolcBuild = {
      version: SOLIDITY_VERSION,
      longVersion: normalizedVersion,
      compilerPath: LOCAL_SOLC_JS_PATH,
      isSolcJs: true
    };

    return build;
  }
);

const config: HardhatUserConfig = {
  solidity: {
    version: SOLIDITY_VERSION,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  paths: {
    root: __dirname,
    sources: './contracts',
    tests: './hardhat/test',
    cache: './hardhat/cache',
    artifacts: './artifacts'
  },
  mocha: {
    timeout: 60000
  },
  gasReporter: {
    enabled: true,
    showTimeSpent: true,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY ?? '',
    currency: 'USD',
    gasPrice: 21
  },
  contractSizer: {
    runOnCompile: false,
    strict: true,
    except: []
  }
};

export default config;
