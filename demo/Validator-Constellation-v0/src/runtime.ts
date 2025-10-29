import hre from 'hardhat';
import type { HardhatEthersHelpers } from '@nomicfoundation/hardhat-ethers/types';

export const ethers = (
  hre as typeof hre & {
    ethers: typeof import('ethers') & HardhatEthersHelpers;
  }
).ethers;

export default hre;
