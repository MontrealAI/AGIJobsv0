'use strict';

const modules = require('../../config/implementation-modules.json');
const deployments = new WeakMap();

/** Deploy fixed implementations before a controller, reusing code on this provider. */
async function deployImplementations(contractName, signer, runtime) {
  const ethers = runtime || require('hardhat').ethers;
  const names = modules[contractName];
  if (!names) throw new Error(`Unknown modular controller: ${contractName}`);
  signer ||= (await ethers.getSigners())[0];
  const provider = signer.provider;
  if (!provider)
    throw new Error('Implementation deployment needs a connected signer');
  let cached = deployments.get(provider);
  if (!cached) deployments.set(provider, (cached = new Map()));
  const addresses = [];
  for (const name of names) {
    const previous = cached.get(name);
    let address = previous?.address;
    // Snapshots and chain resets may have removed a cached deployment.
    if (!address || (await provider.getCode(address)) !== previous.code) {
      const factory = await ethers.getContractFactory(
        `contracts/v2/implementation/${name}.sol:${name}`,
        signer
      );
      const implementation = await factory.deploy();
      await implementation.waitForDeployment();
      address = await implementation.getAddress();
      cached.set(name, { address, code: await provider.getCode(address) });
    }
    const implementation = await ethers.getContractAt(
      ['function moduleId() view returns (bytes32)'],
      address,
      signer
    );
    if ((await implementation.moduleId()) !== ethers.id(`${name}:v1`)) {
      cached.delete(name);
      throw new Error(
        `Implementation identity mismatch: ${name} at ${address}`
      );
    }
    addresses.push(address);
  }
  return addresses;
}

module.exports = { deployImplementations };
