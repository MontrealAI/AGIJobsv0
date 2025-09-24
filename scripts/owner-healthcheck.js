#!/usr/bin/env node
/* eslint-disable */
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

const ok = (m) => console.log(`✅ ${m}`);
const die = (m) => {
  console.error(`❌ ${m}`);
  process.exit(1);
};

(async () => {
  const web3 = new Web3('http://127.0.0.1:8545');
  const accounts = await web3.eth.getAccounts();
  const owner = accounts[0];

  const buildDir = path.join(process.cwd(), 'build', 'contracts');
  if (!fs.existsSync(buildDir)) die('Truffle artifacts not found (build/contracts).');

  const netId = await web3.eth.net.getId();
  const artifacts = fs.readdirSync(buildDir).filter((f) => f.endsWith('.json'));
  let tested = 0;

  for (const file of artifacts) {
    const artifact = JSON.parse(fs.readFileSync(path.join(buildDir, file), 'utf8'));
    const deployed = artifact.networks?.[netId]?.address;
    if (!deployed) continue;

    const contract = new web3.eth.Contract(artifact.abi, deployed);

    if (contract.methods.owner) {
      const current = await contract.methods.owner().call().catch(() => null);
      if (!current) die(`${artifact.contractName}: owner() null`);
      if (contract.methods.transferOwnership) {
        await contract.methods
          .transferOwnership(current)
          .send({ from: owner, gas: 200000 })
          .catch(() => die(`${artifact.contractName}: transferOwnership(self) failed`));
        ok(`${artifact.contractName}: owner can transferOwnership(self)`);
      } else {
        ok(`${artifact.contractName}: Ownable detected`);
      }
    }

    if (contract.methods.DEFAULT_ADMIN_ROLE && contract.methods.hasRole) {
      const role = await contract.methods.DEFAULT_ADMIN_ROLE().call();
      const isAdmin = await contract.methods
        .hasRole(role, owner)
        .call()
        .catch(() => false);
      if (!isAdmin) die(`${artifact.contractName}: owner is not DEFAULT_ADMIN_ROLE`);
      ok(`${artifact.contractName}: AccessControl admin ok`);
    }

    if (contract.methods.paused) {
      const paused = await contract.methods.paused().call().catch(() => false);
      if (!paused && contract.methods.pause) {
        await contract.methods
          .pause()
          .send({ from: owner, gas: 120000 })
          .catch(() => die(`${artifact.contractName}: pause() failed`));
      }
      if (contract.methods.unpause) {
        await contract.methods
          .unpause()
          .send({ from: owner, gas: 120000 })
          .catch(() => die(`${artifact.contractName}: unpause() failed`));
      }
      ok(`${artifact.contractName}: pause/unpause owner control ok`);
    }

    tested += 1;
  }

  if (!tested) die('No deployed contracts found on devnet.');
  ok('Owner healthcheck passed.');
})();
