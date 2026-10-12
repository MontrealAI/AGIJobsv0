// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { compileJobs, verifyWorkOrderSeal } from '../../packages/successor-core/src/compiler.mjs';
import { digestObject, canonicalize } from '../../packages/successor-core/src/integrity.mjs';

export async function verifyBuildPack(pack) {
  if (!pack || pack.schema !== 'successor-build-example/v1' || pack.scope !== 'LOCAL_REHEARSAL') throw Error('Unsupported workshop package');
  const { integrityDigest, ...record } = pack;
  if (integrityDigest !== await digestObject('successor-build-example.v1', record)) throw Error('Package digest mismatch');
  const matches = (actual, expected) => canonicalize(actual ?? null) === canonicalize(expected);
  if (!matches(pack.token, {symbol:'AGIALPHA', address:'0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA', chainId:1, decimals:18})) throw Error('Wrong token binding');
  if (!matches(pack.admission, {decision:'HOLD', independentProof:false, specialistASI:false, authority:[]})) throw Error('A workshop cannot grant authority');
  if (!matches(pack.settlement, {status:'NOT_CONNECTED', spentBaseUnits:'0', transactions:[], allowanceIs:'ILLUSTRATIVE_NOT_FUNDED'})) throw Error('A workshop cannot attest live settlement');
  const jobs = pack.compilation?.graph?.nodes;
  if (!Array.isArray(jobs) || jobs.length !== 21) throw Error('Expected 21 work orders');
  for (const job of jobs) {
    if (job.state !== 'DRAFT' || job.signatureStatus !== 'UNSIGNED_COMMITMENT' || !(await verifyWorkOrderSeal(job))) throw Error('Invalid draft commitment');
  }
  const rebuilt = await compileJobs(pack.compilation.constitution, {jobs, edges:pack.compilation.graph.edges, now:pack.createdAt});
  if (canonicalize(rebuilt) !== canonicalize(pack.compilation)) throw Error('Compilation does not reproduce');
  return { integrity: 'CONSISTENT_NOT_AUTHENTICATED', workOrders: jobs.length, recompilation: 'MATCH', independentProof: false, authority: [], settlement: 'NOT_CONNECTED', scope: 'Historical package consistency only; no mission correctness, present validity or live admission is established.' };
}
export function readBuildPack(file) {
  if (!file) throw Error('Supply a workshop JSON package of at most 2 MB');
  const handle=fs.openSync(file,'r'), limit=2000000;
  try {
    const buffer=Buffer.alloc(limit+1);
    let size=0;
    while (size<buffer.length) {
      const count=fs.readSync(handle,buffer,size,buffer.length-size,null);
      if (count===0) break;
      size+=count;
    }
    if (size>limit) throw Error('Supply a workshop JSON package of at most 2 MB');
    return JSON.parse(buffer.subarray(0,size).toString('utf8'));
  } finally { fs.closeSync(handle); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await verifyBuildPack(readBuildPack(process.argv[2])),null,2));
}
