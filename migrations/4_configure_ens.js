const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const IdentityRegistry = artifacts.require('IdentityRegistry');
const { loadEnsConfig } = require('../scripts/config');

const ADDRESSES_PATH = path.join(
  __dirname,
  '..',
  'docs',
  'deployment-addresses.json'
);

function readAddressBook() {
  try {
    const data = fs.readFileSync(ADDRESSES_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

module.exports = async function (_deployer, network) {
  const addresses = readAddressBook();
  const identityAddress = addresses.identityRegistry;
  if (!identityAddress || identityAddress === ethers.ZeroAddress) {
    console.log('Skipping ENS configuration; identity registry not deployed.');
    return;
  }

  const identity = await IdentityRegistry.at(identityAddress);
  const { config: ensConfig } = loadEnsConfig({ network });

  if (!ensConfig.registry) {
    throw new Error('ENS registry address missing from configuration');
  }

  const pending = [];

  const currentEns = await identity.ens();
  if (currentEns.toLowerCase() !== ensConfig.registry.toLowerCase()) {
    pending.push(
      identity
        .setENS(ensConfig.registry)
        .then(() => console.log(`Set ENS registry to ${ensConfig.registry}`))
    );
  }

  if (ensConfig.nameWrapper && ensConfig.nameWrapper !== ethers.ZeroAddress) {
    const currentWrapper = await identity.nameWrapper();
    if (currentWrapper.toLowerCase() !== ensConfig.nameWrapper.toLowerCase()) {
      pending.push(
        identity
          .setNameWrapper(ensConfig.nameWrapper)
          .then(() =>
            console.log(`Set ENS NameWrapper to ${ensConfig.nameWrapper}`)
          )
      );
    }
  }

  const roots = ensConfig.roots || {};
  const agentRoot = roots.agent || {};
  const clubRoot = roots.club || {};

  if (!agentRoot.node || !clubRoot.node) {
    throw new Error('ENS configuration missing agent or club root node');
  }

  const currentAgentRoot = await identity.agentRootNode();
  if (currentAgentRoot.toLowerCase() !== agentRoot.node.toLowerCase()) {
    pending.push(
      identity
        .setAgentRootNode(agentRoot.node)
        .then(() => console.log(`Configured agent root node ${agentRoot.node}`))
    );
  }

  const currentClubRoot = await identity.clubRootNode();
  if (currentClubRoot.toLowerCase() !== clubRoot.node.toLowerCase()) {
    pending.push(
      identity
        .setClubRootNode(clubRoot.node)
        .then(() => console.log(`Configured club root node ${clubRoot.node}`))
    );
  }

  const agentMerkle = agentRoot.merkleRoot || ethers.ZeroHash;
  const currentAgentMerkle = await identity.agentMerkleRoot();
  if (currentAgentMerkle.toLowerCase() !== agentMerkle.toLowerCase()) {
    pending.push(
      identity
        .setAgentMerkleRoot(agentMerkle)
        .then(() => console.log(`Set agent Merkle root to ${agentMerkle}`))
    );
  }

  const validatorMerkle = clubRoot.merkleRoot || ethers.ZeroHash;
  const currentValidatorMerkle = await identity.validatorMerkleRoot();
  if (currentValidatorMerkle.toLowerCase() !== validatorMerkle.toLowerCase()) {
    pending.push(
      identity
        .setValidatorMerkleRoot(validatorMerkle)
        .then(() =>
          console.log(`Set validator Merkle root to ${validatorMerkle}`)
        )
    );
  }

  if (pending.length === 0) {
    console.log('Identity registry already aligned with ENS configuration.');
  } else {
    await Promise.all(pending);
    console.log('ENS configuration applied to identity registry.');
  }
};
