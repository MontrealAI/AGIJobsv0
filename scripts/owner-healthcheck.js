#!/usr/bin/env node
/* eslint-disable */
const Web3 = require('web3');
const fs = require('fs'); const path = require('path');

const ok=(m)=>console.log(`✅ ${m}`), die=(m)=>{ console.error(`❌ ${m}`); process.exit(1); };

(async () => {
  const web3 = new Web3('http://127.0.0.1:8545');
  const accounts = await web3.eth.getAccounts();
  const owner = accounts[0];

  const buildDir = path.join(process.cwd(), 'build', 'contracts');
  const netId = await web3.eth.net.getId();
  const arts = fs.readdirSync(buildDir).filter(f=>f.endsWith('.json'));
  let tested = 0;

  for (const f of arts) {
    const a = JSON.parse(fs.readFileSync(path.join(buildDir,f),'utf8'));
    const addr = a.networks?.[netId]?.address; if (!addr) continue;
    const c = new web3.eth.Contract(a.abi, addr);

    if (c.methods.owner) {
      const curr = await c.methods.owner().call().catch(()=>null);
      if (!curr) die(`${a.contractName}: owner() null`);
      if (c.methods.transferOwnership) {
        await c.methods.transferOwnership(curr).send({from: owner, gas: 200000}).catch(()=>die(`${a.contractName}: transferOwnership(self) failed`));
        ok(`${a.contractName}: owner can transferOwnership(self)`);
      } else {
        ok(`${a.contractName}: Ownable detected`);
      }
    }
    if (c.methods.DEFAULT_ADMIN_ROLE && c.methods.hasRole) {
      const role = await c.methods.DEFAULT_ADMIN_ROLE().call();
      const isAdmin = await c.methods.hasRole(role, owner).call().catch(()=>false);
      if (!isAdmin) die(`${a.contractName}: owner is not DEFAULT_ADMIN_ROLE`);
      ok(`${a.contractName}: AccessControl admin ok`);
    }
    if (c.methods.paused) {
      const p = await c.methods.paused().call().catch(()=>false);
      if (!p && c.methods.pause)  await c.methods.pause().send({from: owner, gas: 120000}).catch(()=>die(`${a.contractName}: pause() failed`));
      if (c.methods.unpause) await c.methods.unpause().send({from: owner, gas: 120000}).catch(()=>die(`${a.contractName}: unpause() failed`));
      ok(`${a.contractName}: pause/unpause owner control ok`);
    }
    tested++;
  }
  if (!tested) die('No deployed contracts found on devnet.');
  ok('Owner healthcheck passed.');
})();
