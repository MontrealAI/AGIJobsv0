#!/usr/bin/env node
/* eslint-disable */
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

const TOKEN_EXPECTED = process.argv.includes('--token')
  ? process.argv[process.argv.indexOf('--token') + 1]
  : process.env.AGIALPHA_TOKEN;

const ok = (m) => console.log(`✅ ${m}`);
const die = (m) => {
  console.error(`❌ ${m}`);
  process.exit(1);
};

(async () => {
  const rpc = process.env.WEB3_RPC || 'http://127.0.0.1:8545';
  const web3 = new Web3(rpc);
  const netId = await web3.eth.net.getId();

  const buildDir = path.join(process.cwd(), 'build', 'contracts');
  if (!fs.existsSync(buildDir)) die('Truffle artifacts not found (build/contracts).');

  const readArtifact = (name) => {
    const file = path.join(buildDir, `${name}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  };

  const attach = (name) => {
    const artifact = readArtifact(name);
    if (!artifact) return null;
    const address = artifact.networks?.[netId]?.address;
    if (!address) return null;
    return {
      abi: artifact.abi,
      addr: address,
      contract: new web3.eth.Contract(artifact.abi, address),
    };
  };

  const registry = attach('JobRegistry');
  if (!registry) die('JobRegistry not deployed on devnet.');

  const stake = attach('StakeManager');
  const feePool = attach('FeePool');
  const identity = attach('IdentityRegistry');
  const validation = attach('ValidationModule');
  const dispute = attach('DisputeModule');
  const reputation = attach('ReputationEngine');

  const wiring = {
    identity,
    staking: stake,
    validation,
    dispute,
    reputation,
    feePool,
  };

  for (const [getter, target] of Object.entries(wiring)) {
    if (!target) continue;
    const method = registry.contract.methods[getter];
    if (!method) continue;
    const wired = await method().call().catch(() => null);
    if (wired && wired.toLowerCase() !== target.addr.toLowerCase()) {
      die(`JobRegistry.${getter} != ${target.addr} (got ${wired})`);
    }
    ok(`JR.${getter} wired`);
  }

  if (TOKEN_EXPECTED && (stake || feePool)) {
    let token = null;
    if (stake?.contract.methods.token) {
      token = await stake.contract.methods.token().call().catch(() => null);
    }
    if (!token && feePool?.contract.methods.token) {
      token = await feePool.contract.methods.token().call().catch(() => null);
    }
    if (token && token.toLowerCase() !== TOKEN_EXPECTED.toLowerCase()) {
      die(`AGIALPHA mismatch: expected ${TOKEN_EXPECTED}, got ${token}`);
    }
    if (token) ok(`AGIALPHA wired: ${token}`);
  }

  ok('Wiring verification passed.');
  process.exit(0);
})();
