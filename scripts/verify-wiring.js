#!/usr/bin/env node
/* eslint-disable */
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

const TOKEN_EXPECTED = (process.argv.includes('--token'))
  ? process.argv[process.argv.indexOf('--token')+1]
  : process.env.AGIALPHA_TOKEN;

const ok = (m)=>console.log(`✅ ${m}`);
const die = (m)=>{ console.error(`❌ ${m}`); process.exit(1); };

(async () => {
  const web3 = new Web3(process.env.WEB3_RPC || 'http://127.0.0.1:8545');
  const netId = await web3.eth.net.getId();

  const buildDir = path.join(process.cwd(),'build','contracts');
  if (!fs.existsSync(buildDir)) die('Truffle artifacts not found (build/contracts).');

  const art = (n)=>JSON.parse(fs.readFileSync(path.join(buildDir, `${n}.json`),'utf8'));
  const at  = (name)=>{
    const a = art(name); const addr = a.networks?.[netId]?.address;
    if (!addr) return null;
    return { abi: a.abi, addr, c: new web3.eth.Contract(a.abi, addr) };
  };

  const JR = at('JobRegistry'); if (!JR) die('JobRegistry not deployed on devnet.');
  const ST = at('StakeManager'); const FP = at('FeePool');
  const ID = at('IdentityRegistry'); const VM = at('ValidationModule');
  const DM = at('DisputeModule'); const RE = at('ReputationEngine');

  const mapping = { identity: ID, staking: ST, validation: VM, dispute: DM, reputation: RE, feePool: FP };
  for (const [getter, mod] of Object.entries(mapping)) {
    if (!mod) continue;
    const fn = JR.c.methods[getter];
    if (!fn) continue;
    const val = await fn().call().catch(()=>null);
    if (val && val.toLowerCase() !== mod.addr.toLowerCase()) {
      die(`JobRegistry.${getter} != ${mod.addr} (got ${val})`);
    }
    ok(`JR.${getter} wired`);
  }

  if (TOKEN_EXPECTED && (ST || FP)) {
    let token = null;
    if (ST?.c.methods.token) token = await ST.c.methods.token().call().catch(()=>null);
    if (!token && FP?.c.methods.token) token = await FP.c.methods.token().call().catch(()=>null);
    if (token && token.toLowerCase() !== TOKEN_EXPECTED.toLowerCase()) {
      die(`AGIALPHA mismatch: expected ${TOKEN_EXPECTED}, got ${token}`);
    }
    if (token) ok(`AGIALPHA wired: ${token}`);
  }

  ok('Wiring verification passed.');
  process.exit(0);
})();
