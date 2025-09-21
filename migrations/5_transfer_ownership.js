const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const SystemPause = artifacts.require('SystemPause');
const CertificateNFT = artifacts.require('CertificateNFT');
const JobRouter = artifacts.require('JobRouter');
const PlatformIncentives = artifacts.require('PlatformIncentives');
const TaxPolicy = artifacts.require('TaxPolicy');
const IdentityRegistry = artifacts.require('IdentityRegistry');

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

async function transferIfNeeded(contractName, artifact, address, newOwner) {
  if (!address || address === ethers.ZeroAddress) {
    console.log(`Skipping ${contractName}: no address configured.`);
    return;
  }
  const instance = await artifact.at(address);
  if (!instance.owner) {
    console.log(`Skipping ${contractName}: owner() not available.`);
    return;
  }
  const currentOwner = (await instance.owner()).toLowerCase();
  const desired = newOwner.toLowerCase();
  if (currentOwner === desired) {
    console.log(`${contractName} already owned by ${newOwner}`);
    return;
  }
  const tx = await instance.transferOwnership(newOwner);
  console.log(
    `${contractName}: transferOwnership(${newOwner}) -> tx ${
      tx.tx || tx.receipt?.transactionHash
    }`
  );
}

module.exports = async function (_deployer, _network, accounts) {
  const addresses = readAddressBook();
  const newOwner = process.env.GOVERNANCE_ADDRESS || accounts[0];
  if (!newOwner || newOwner === ethers.ZeroAddress) {
    throw new Error('GOVERNANCE_ADDRESS must be set to transfer ownership');
  }

  if (!addresses.systemPause || addresses.systemPause === ethers.ZeroAddress) {
    console.log('SystemPause not deployed; skipping governance handoff.');
  } else {
    const pause = await SystemPause.at(addresses.systemPause);
    const currentGov = (await pause.owner()).toLowerCase();
    const target = newOwner.toLowerCase();
    if (currentGov !== target) {
      const tx = await pause.setGovernance(newOwner);
      console.log(
        `SystemPause governance updated to ${newOwner} (tx ${
          tx.tx || tx.receipt?.transactionHash
        })`
      );
    } else {
      console.log(`SystemPause already governed by ${newOwner}`);
    }
  }

  await transferIfNeeded(
    'CertificateNFT',
    CertificateNFT,
    addresses.certificateNFT,
    newOwner
  );
  await transferIfNeeded('JobRouter', JobRouter, addresses.jobRouter, newOwner);
  await transferIfNeeded(
    'PlatformIncentives',
    PlatformIncentives,
    addresses.platformIncentives,
    newOwner
  );
  await transferIfNeeded(
    'IdentityRegistry',
    IdentityRegistry,
    addresses.identityRegistry,
    newOwner
  );
  if (addresses.taxPolicy && addresses.taxPolicy !== ethers.ZeroAddress) {
    await transferIfNeeded(
      'TaxPolicy',
      TaxPolicy,
      addresses.taxPolicy,
      newOwner
    );
  }

  console.log('Ownership handoff complete.');
  console.log(
    'Reminder: StakeManager and JobRegistry remain governed by SystemPause.'
  );
};
