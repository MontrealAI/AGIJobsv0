import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

console.log('[Trustless Economic Core] Loading dedicated Hardhat config');

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.25',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    root: __dirname,
    sources: './contracts',
    tests: '../test/demo',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
