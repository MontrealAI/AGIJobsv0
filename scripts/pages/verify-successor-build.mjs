// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { compileJobs, verifyWorkOrderSeal } from '../../packages/successor-core/src/compiler.mjs';
import { digestObject, canonicalize } from '../../packages/successor-core/src/integrity.mjs';
import { validateRequest, validateCandidate, generateCandidates, digest as alphaDigest, VERSION as ALPHA_VERSION } from './vendor/alpha-successor/engine.mjs';
const alphaProvenance=JSON.parse(fs.readFileSync(new URL('./vendor/alpha-successor/provenance.json',import.meta.url),'utf8'));

const configuration={version:'number',layout:'string',cache_last:'boolean',update:'string'};
const attempt={config:configuration,construction:{operator:'string',seed:'number',parent:'string'},artifact_hash:'string',correctness:'boolean',elapsed_ns:'number',rows:'number'};
const alphaSections={
  request:{schema_version:'number',kind:'string',mission:'string',seed:'number',max_candidates:'number',formation_trials:'number',max_events:'number',language:'string',request_id:'string'},
  discovery:{world:{version:'number',prediction:'string',uncertainty:'string',experiment:'string',selection_rule:'string',observation:{nested_mean_ns:'number',tuple_mean_ns:'number',interpretation:'string'},falsified_in_this_run:'boolean'},attempts:[attempt],selected:attempt,generation_budget:'number',actual_candidates:'number',source:'string'},
  frozen:{manifest:{schema_version:'number',request_hash:'string',grammar:configuration,candidate_hash:'string',engine:'string',engine_source_hash:'string',comparators:['string'],protocol:'string',correctness_required:'boolean',minimum_speedup_ppm:'number',costs:{money:null,review:null,memory:null},authority:[]},release_hash:'string'},
  evaluation:{schema_version:'number',scope:'string',release_hash:'string',cases:[{case_index:'number',events:'number',current_ns:'number',beta_ns:'number',candidate_ns:'number',exact_output:'boolean'}],correctness:'boolean',totals_ns:{current:'number',beta:'number',candidate:'number'},best_comparator:'string',local_verdict:'string',institutional_verdict:'string',missing:['string'],authority:[],timing_limitations:'string'},
  chronicle:[{kind:'string',candidateRelease:'string',reusable:'string',inheritedProof:'boolean',inheritedAuthority:'boolean'}],
};
function requireKeys(value,keys) {
  if (!value || typeof value!=='object' || Array.isArray(value) || canonicalize(Object.keys(value).sort())!==canonicalize([...keys].sort())) throw Error('Unsupported workshop fields');
}
function requireShape(value,shape) {
  if (shape===null) { if(value!==null)throw Error('Unsupported workshop value');return; }
  if (typeof shape==='string') { if(typeof value!==shape)throw Error('Unsupported workshop type');return; }
  if (Array.isArray(shape)) {
    if(!Array.isArray(value) || (!shape.length && value.length))throw Error('Unsupported workshop array or authority');
    if(shape.length)for(const item of value)requireShape(item,shape[0]);
    return;
  }
  requireKeys(value,Object.keys(shape));
  for(const key of Object.keys(shape))requireShape(value[key],shape[key]);
}
function verifyEvaluation(pack) {
  const evaluation=pack.evaluation, totals={current:0,beta:0,candidate:0};
  if(evaluation.cases.length!==6 || pack.discovery.selected.correctness!==true)throw Error('Workshop evaluation requires six cases and a feasible candidate');
  for(const [index,item] of evaluation.cases.entries()){
    if(item.case_index!==index || item.events!==(index<2?64:pack.request.max_events))throw Error('Workshop evaluation case binding mismatch');
    for(const key of Object.keys(totals)){
      const elapsed=item[key+'_ns'];
      if(!Number.isSafeInteger(elapsed) || elapsed<1)throw Error('Invalid workshop timing');
      totals[key]+=elapsed;
      if(!Number.isSafeInteger(totals[key]))throw Error('Invalid workshop timing total');
    }
  }
  const correctness=evaluation.cases.every(item=>item.exact_output);
  const best=totals.current<=totals.beta?'current':'beta';
  const verdict=!correctness?'FAIL':totals.candidate>=totals[best]?(best==='beta'?'RETAIN_ALTERNATIVE':'RETAIN_INCUMBENT'):totals.candidate/totals[best]>0.95?'INSUFFICIENT_MARGIN':'LOCAL_SPEEDUP_OBSERVED';
  if(canonicalize(evaluation.totals_ns)!==canonicalize(totals) || evaluation.correctness!==correctness || evaluation.best_comparator!==best || evaluation.local_verdict!==verdict)throw Error('Workshop evaluation derived results mismatch');
}
function verifyDiscovery(pack) {
  const discovery=pack.discovery, attempts=discovery.attempts;
  const configurations=generateCandidates(pack.request.seed,pack.request.max_candidates);
  configurations.sort((a,b)=>Number(b.layout==='nested')-Number(a.layout==='nested'));
  if(pack.request.max_candidates!==4 || discovery.generation_budget!==4 || discovery.actual_candidates!==4 || attempts.length!==4 || discovery.source!==ALPHA_VERSION || discovery.world.version!==1)throw Error('Workshop discovery budget or source mismatch');
  for(const [index,item] of attempts.entries()){
    if(canonicalize(item.config)!==canonicalize(configurations[index]) || !Number.isSafeInteger(item.elapsed_ns) || item.elapsed_ns<1 || !Number.isSafeInteger(item.rows) || item.rows<0 || canonicalize(item.construction)!==canonicalize({operator:'bounded-grammar-composition',seed:pack.request.seed,parent:ALPHA_VERSION}))throw Error('Workshop discovery attempt mismatch');
  }
  const feasible=attempts.filter(item=>item.correctness).sort((a,b)=>a.elapsed_ns-b.elapsed_ns);
  if(!feasible.length || canonicalize(discovery.selected)!==canonicalize(feasible[0]))throw Error('Workshop discovery selection mismatch');
  const mean=layout=>{const items=attempts.filter(item=>item.config.layout===layout);return Math.round(items.reduce((sum,item)=>sum+item.elapsed_ns,0)/(items.length||1));};
  const nested=mean('nested'),tuple=mean('tuple');
  if(discovery.world.observation.nested_mean_ns!==nested || discovery.world.observation.tuple_mean_ns!==tuple || discovery.world.falsified_in_this_run!==(nested>=tuple))throw Error('Workshop discovery observation mismatch');
}

export async function verifyBuildPack(pack) {
  if (!pack || pack.schema !== 'successor-build-example/v1' || pack.scope !== 'LOCAL_REHEARSAL') throw Error('Unsupported workshop package');
  const { integrityDigest, ...record } = pack;
  if (integrityDigest !== await digestObject('successor-build-example.v1', record)) throw Error('Package digest mismatch');
  const matches = (actual, expected) => canonicalize(actual ?? null) === canonicalize(expected);
  if (!matches(pack.token, {symbol:'AGIALPHA', address:'0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA', chainId:1, decimals:18})) throw Error('Wrong token binding');
  if (!matches(pack.admission, {decision:'HOLD', independentProof:false, specialistASI:false, authority:[]})) throw Error('A workshop cannot grant authority');
  if (!matches(pack.settlement, {status:'NOT_CONNECTED', spentBaseUnits:'0', transactions:[], allowanceIs:'ILLUSTRATIVE_NOT_FUNDED'})) throw Error('A workshop cannot attest live settlement');
  requireKeys(pack,['schema','createdAt','title','scope','request','compilation','discovery','frozen','evaluation','token','settlement','admission','chronicle','integrityDigest']);
  for(const [key,shape] of Object.entries(alphaSections))requireShape(pack[key],shape);
  if(pack.evaluation.institutional_verdict!=='HOLD' || pack.evaluation.scope!=='browser-rehearsal' || pack.chronicle.length!==1 || pack.chronicle.some(note=>note.inheritedProof!==false || note.inheritedAuthority!==false)) throw Error('A workshop cannot grant or inherit authority');
  if(!matches(pack.evaluation.missing,['independent-verifier','frontier-comparator','measured-peak-memory','accepted-realized-economics','principal-issued-authority']))throw Error('Workshop proof remains incomplete');
  const manifest=pack.frozen.manifest;
  validateRequest(pack.request);validateCandidate(manifest.grammar);
  if(manifest.engine!==ALPHA_VERSION || manifest.engine_source_hash!==alphaProvenance.sha256 || manifest.protocol!=='browser-local-aggregation-v1' || manifest.correctness_required!==true || manifest.minimum_speedup_ppm!==50000 || !matches(manifest.comparators,['current-one-pass-map-v1','beta-sorted-reduction-v1']))throw Error('Unsupported workshop engine or protocol');
  if(manifest.request_hash!==await alphaDigest('request',pack.request) || manifest.candidate_hash!==await alphaDigest('candidate',manifest.grammar) || pack.frozen.release_hash!==await alphaDigest('release',manifest) || pack.evaluation.release_hash!==pack.frozen.release_hash || pack.chronicle[0].candidateRelease!==pack.frozen.release_hash)throw Error('Workshop Alpha commitment mismatch');
  if(!matches(pack.discovery.selected.config,manifest.grammar) || pack.discovery.selected.artifact_hash!==manifest.candidate_hash || !pack.discovery.attempts.some(item=>matches(item,pack.discovery.selected)))throw Error('Workshop selected candidate mismatch');
  for(const item of pack.discovery.attempts){validateCandidate(item.config);if(item.artifact_hash!==await alphaDigest('candidate',item.config))throw Error('Workshop candidate commitment mismatch');}
  verifyDiscovery(pack);verifyEvaluation(pack);
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
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size)));
  } finally { fs.closeSync(handle); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await verifyBuildPack(readBuildPack(process.argv[2])),null,2));
}
