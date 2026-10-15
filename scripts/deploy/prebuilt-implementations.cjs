'use strict';

const ethers = require('ethers');
const prebuilt = require('../v2/lib/prebuilt/ImplementationModules.json');
const modules = require('../../config/implementation-modules.json');

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
  // Historical no-compile demos use a matched v1 controller + v1 implementation bundle.
  // Never route these through the new percentage controller; it rejects these IDs.
  const names = modules[contractName];
  if (!names) throw new Error(`Unknown modular controller: ${contractName}`);
  const addresses = [];
  for (const name of names) {
    const factory = runtime.getContractFactory(`contracts/v2/implementation/${name}.sol:${name}`, signer);
    const implementation = await factory.deploy();
    await implementation.waitForDeployment();
    const address = await implementation.getAddress();
    const check = runtime.getContractAt(['function moduleId() view returns (bytes32)'], address, signer);
    if (await check.moduleId() !== ethers.id(`${name}:v1`)) throw new Error(`Legacy prebuilt identity mismatch: ${name}`);
    addresses.push(address);
  }
  return addresses;
}

module.exports = { deployPrebuiltImplementations };
