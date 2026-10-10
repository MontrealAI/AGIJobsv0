'use strict';

const modules = require('../../config/implementation-modules.json');
const deployments = new WeakMap();

/** Deploy fixed implementations before a controller, reusing code on this provider. */
async function deployImplementations(
  contractName,
  signer,
  runtime,
  options = {}
) {
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
      if (options.onSubmitted)
        await options.onSubmitted(
          name,
          implementation.deploymentTransaction().hash
        );
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

/** Read the fixed module inventory from deployed controllers for release evidence. */
async function readImplementationAddresses(controllers, runtime) {
  const ethers = runtime || require('hardhat').ethers;
  const inventory = {};
  for (const [controller, names] of Object.entries(modules)) {
    const contract = await ethers.getContractAt(
      `contracts/v2/${controller}.sol:${controller}`,
      controllers[controller]
    );
    const addresses = await contract.implementationModules();
    if (addresses.length !== names.length)
      throw new Error(`Invalid implementation inventory for ${controller}`);
    for (let i = 0; i < names.length; i += 1) {
      if (
        !ethers.isAddress(addresses[i]) ||
        addresses[i] === ethers.ZeroAddress
      )
        throw new Error(`Missing deployed implementation: ${names[i]}`);
      inventory[names[i]] = addresses[i];
    }
  }
  return inventory;
}

module.exports = { deployImplementations, readImplementationAddresses };
