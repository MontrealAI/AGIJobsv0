// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { compileJobs, verifyWorkOrderSeal } from '../../packages/successor-core/src/compiler.mjs';
import { digestObject, canonicalize } from '../../packages/successor-core/src/integrity.mjs';

export async function verifyBuildPack(pack) {
  if (!pack || pack.schema !== 'successor-build-example/v1' || pack.scope !== 'LOCAL_REHEARSAL') throw Error('Unsupported workshop package');
  const { integrityDigest, ...record } = pack;
  if (integrityDigest !== await digestObject('successor-build-example.v1', record)) throw Error('Package digest mismatch');
  if (pack.token?.address !== '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA' || pack.token.chainId !== 1 || pack.token.decimals !== 18) throw Error('Wrong token binding');
  if (pack.admission?.decision !== 'HOLD' || pack.admission.independentProof !== false || pack.admission.specialistASI !== false || pack.admission.authority?.length !== 0) throw Error('A workshop cannot grant authority');
  if (pack.settlement?.status !== 'NOT_CONNECTED' || pack.settlement.spentBaseUnits !== '0' || pack.settlement.transactions?.length !== 0) throw Error('A workshop cannot attest live settlement');
  const jobs = pack.compilation?.graph?.nodes;
  if (!Array.isArray(jobs) || jobs.length !== 21) throw Error('Expected 21 work orders');
  for (const job of jobs) {
    if (job.state !== 'DRAFT' || job.signatureStatus !== 'UNSIGNED_COMMITMENT' || !(await verifyWorkOrderSeal(job))) throw Error('Invalid draft commitment');
  }
  const rebuilt = await compileJobs(pack.compilation.constitution, {jobs, edges:pack.compilation.graph.edges, now:pack.createdAt});
  if (canonicalize(rebuilt) !== canonicalize(pack.compilation)) throw Error('Compilation does not reproduce');
  return { integrity: 'CONSISTENT_NOT_AUTHENTICATED', workOrders: jobs.length, recompilation: 'MATCH', independentProof: false, authority: [], settlement: 'NOT_CONNECTED', scope: 'Historical package consistency only; no mission correctness, present validity or live admission is established.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file=process.argv[2];
  if (!file || fs.statSync(file).size > 2000000) throw Error('Supply a workshop JSON package of at most 2 MB');
  console.log(JSON.stringify(await verifyBuildPack(JSON.parse(fs.readFileSync(file,'utf8'))),null,2));
}
