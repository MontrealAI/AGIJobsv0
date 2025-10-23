import '@nomicfoundation/hardhat-toolbox';
import 'hardhat-contract-sizer';
import 'solidity-coverage';
import type { HardhatUserConfig } from 'hardhat/config';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.25',
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
