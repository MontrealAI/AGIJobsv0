import baseConfig from './hardhat.config';
import type { HardhatUserConfig } from 'hardhat/config';

const coverageConfig: HardhatUserConfig = {
  ...baseConfig,
  mocha: {
    timeout: 120000
  }
};

export default coverageConfig;
