require('@nomicfoundation/hardhat-toolbox');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: { version: '0.8.21', settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true } },
  paths: {
    sources: './contracts'
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true
    }
  }
};
