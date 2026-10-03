'use strict';

const ethers = require('ethers');
const prebuilt = require('../v2/lib/prebuilt/ImplementationModules.json');
const { deployImplementations } = require('./implementations.cjs');

// The no-compile demos must work before Hardhat has produced any artifacts.
// Keep production deployments on the normal compiled-artifact helper.
const runtime = {
  id: ethers.id,
  getContractFactory(fullyQualifiedName, signer) {
    const name = fullyQualifiedName.split(':').pop();
    const artifact = prebuilt[name];
    if (!artifact) throw new Error(`Missing prebuilt implementation: ${name}`);
    return new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  },
  getContractAt(abi, address, signer) {
    return new ethers.Contract(address, abi, signer);
  },
};

async function deployPrebuiltImplementations(contractName, signer) {
  if (!signer) throw new Error('Prebuilt deployment needs a connected signer');
  return deployImplementations(contractName, signer, runtime);
}

module.exports = { deployPrebuiltImplementations };
