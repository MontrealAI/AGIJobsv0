// SPDX-License-Identifier: Apache-2.0
// Source-only local inspection. Caller-installed fixed code and existing mission custody remain separate prerequisites.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {canonical, parseBounded, MAX_INPUT_BYTES} from './discovery-lab-contract.mjs';

export const RECEIVER_SCHEMA = 'agijobsv0/enterprise-native-admission/v1';
export const JOURNAL_SCHEMA = 'autonomous-enterprise-receiver-journal/v1';
export const RECEIVER_ADMISSION_UNITS = 10_000;
const ROUTE = Object.freeze({id:'jobs-agialpha', kind:'alternative-commission-inspection', currency:'AGIALPHA18', decimals:18,
  chainId:1, tokenAddress:'0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA', capBaseUnits:'0', status:'DRAFT_NOT_SUBMITTED'});
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(canonical(value));
const same = (a,b) => canonical(a) === canonical(b);
const need = (ok, code) => {if (!ok) throw Object.assign(Error(code), {code});};
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const integer = x => Number.isSafeInteger(x) && x >= 0 && !Object.is(x,-0);
const bytes = x => Buffer.byteLength(x,'utf8');
const elapsed = start => Math.max(0,Math.ceil(performance.now()-start));
const source = Object.freeze({adapterSha256:sha(readFileSync(new URL(import.meta.url))),
  contractSha256:sha(readFileSync(new URL('./discovery-lab-contract.mjs',import.meta.url))),
  ownerCandidate:'285034830b6cddc47c7e1002ee85a8b008b9763d'});
const RESOURCE_KEYS = ['checkingUnits','elapsedMs','memoryBytes'];
const NATIVE_MEASUREMENT='Declared current shared-session replay delta; native inspections are serialized; unrelated host work is not excluded. '
  +'Memory bytes reserve four canonical UTF-8 input/context/options footprints, not measured peak VM heap; output, control and framing overhead remain unmeasured. '
  +'Checking and elapsed limits are soft checks before and after complete bounded replays; JavaScript execution is not preempted.';
const acceptedHistoricalStates=['FROZEN','TASKS_COMMITTED','INVOCATION_RECONCILED','READY_FOR_SUCCESSOR','SUCCESSOR_ACCEPTED_LOCAL'];
const spent=x=>x===null || integer(x) || x==='unknown-reservation-retained';
const unresolvedNative=receipt=>Boolean(receipt?.work.unknownPartialReplay
  || receipt?.historicalState?.unknownConstructionSpent || receipt?.historicalState?.unresolvedReservation
  || receipt?.historicalState?.futureSpent==='unknown-reservation-retained'
  || receipt?.historicalState?.successorSpent==='unknown-reservation-retained');
const CONTEXT_KEYS = ['schema','source','binding','inspectionId','logicalCommissionId','route','limits'];
const REQUEST_KEYS = ['schema','inspectionId','logicalCommissionId','route','source','binding','payloadDigest',
  'docketDigest','payload','limits','authority','externalSubmission','settlement'];
const RECEIPT_KEYS = ['schema','state','accepted','requestDigest','reconciliationKey','binding','route','source',
  'payloadDigest','docketDigest','resourceUsed','work','reasons','historicalState','authority','externalSubmission',
  'settlement','reconciliation','scope'];
function resources(value) {
  need(exact(value,RESOURCE_KEYS) && RESOURCE_KEYS.every(k=>integer(value[k])), 'ENTERPRISE_RESOURCE_VECTOR'); return value;
}
const fits = (a,b) => RESOURCE_KEYS.every(k=>a[k]<=b[k]);
function freeze(value) {if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function contextFrame(value) {
  const context = copy(value);
  need(exact(context,CONTEXT_KEYS) && context.schema==='autonomous-enterprise-native-context/v1', 'ENTERPRISE_INSTALLED_CONTEXT');
  need(same(context.route,ROUTE),'ENTERPRISE_WRONG_ROUTE_OR_TOKEN');
  need(exact(context.source,['repository','commit','constructor','checker','closure'])
    && context.source.repository==='MontrealAI/AGI-Alpha-Agent-v0' && /^[a-f0-9]{40}$/.test(context.source.commit)
    && ['constructor','checker','closure'].every(k=>hash(context.source[k])), 'ENTERPRISE_INSTALLED_SOURCE');
  need(exact(context.binding,['missionId','revision','eventHead','eventPrefixDigest','attempt','state','freezeDigest',
    'artifactDigests','invocationId']), 'ENTERPRISE_INSTALLED_BINDING');
  need(typeof context.inspectionId==='string' && typeof context.logicalCommissionId==='string', 'ENTERPRISE_INSTALLED_IDENTITIES');
  resources(context.limits);
  need(context.limits.checkingUnits<=100_000_000 && context.limits.elapsedMs<=60_000
    && context.limits.memoryBytes<=32_000_000, 'ENTERPRISE_INSTALLED_LIMITS');
  return freeze(context);
}
function ownedFailure(error, ownUsed, effectiveLimits, uncertain, validatedNative, originalTransport, transportDigest) {
  const failure = new Error('ENTERPRISE_NATIVE_INSPECTION_FAILED',{cause:error});
  failure.code='ENTERPRISE_NATIVE_INSPECTION_FAILED';failure.receiverResourceUsed=freeze(copy(ownUsed));
  failure.nativeReceipt=validatedNative?freeze(validatedNative):null;
  failure.nativeResourceUsed=validatedNative?freeze(copy(validatedNative.resourceUsed)):null;
  failure.nativeResourceReservation=uncertain?freeze(copy(effectiveLimits)):null;
  failure.originalTransport=originalTransport;failure.transportDigest=transportDigest;
  const nativeUsed=validatedNative?.resourceUsed || {checkingUnits:0,elapsedMs:0,memoryBytes:0};
  const totals={checkingUnits:BigInt(ownUsed.checkingUnits)+BigInt(nativeUsed.checkingUnits),
    memoryBytes:BigInt(ownUsed.memoryBytes)+BigInt(nativeUsed.memoryBytes),
    elapsedMs:BigInt(Math.max(ownUsed.elapsedMs,nativeUsed.elapsedMs))};
  failure.resourceTotalsExact=freeze(Object.fromEntries(RESOURCE_KEYS.map(k=>[k,String(totals[k])])));
  failure.resourceUsed=RESOURCE_KEYS.every(k=>totals[k]<=BigInt(Number.MAX_SAFE_INTEGER))
    ?freeze(Object.fromEntries(RESOURCE_KEYS.map(k=>[k,Number(totals[k])]))):null;
  failure.resourceAccounting=uncertain?'RECEIVER_CHARGE_RETAINED_NATIVE_RESERVATION_UNRESOLVED'
    :validatedNative?'CURRENT_RECEIVER_AND_VALIDATED_NATIVE_FAILED_ATTEMPT':'CURRENT_RECEIVER_FAILED_ATTEMPT';
  failure.authority=Object.freeze([]);failure.externalSubmission='NOT_SUBMITTED';failure.settlement='NOT_RUN';
  return Object.freeze(failure);
}

export function enterpriseReceiverCapabilities() {
  return {schema:RECEIVER_SCHEMA,requestSchema:'autonomous-enterprise-native-request/v1',route:{...ROUTE},
    admission:'LOCAL_FIXED_SOURCE_INSPECTION_ONLY',source:{...source},currencyCapBaseUnits:'0',
    operationalPilot:'NOT_RUN',installedSourceCaptureQualified:false,authority:[],externalSubmission:'NOT_SUBMITTED',settlement:'NOT_RUN'};
}

/** Persist exportJournal through the existing mission ledger. Restored records block execution and never grant acceptance. */
export function createEnterpriseReceiver(options) {
  const descriptors=Object.getOwnPropertyDescriptors(options);
  need(Object.keys(descriptors).every(k=>['installedContext','inspectNativeRequest','priorJournal'].includes(k))
    && ['installedContext','inspectNativeRequest'].every(k=>descriptors[k] && Object.hasOwn(descriptors[k],'value'))
    && Object.values(descriptors).every(d=>Object.hasOwn(d,'value')), 'ENTERPRISE_RECEIVER_OPTIONS');
  const context=contextFrame(descriptors.installedContext.value), inspector=descriptors.inspectNativeRequest.value;
  need(typeof inspector==='function','ENTERPRISE_INSTALLED_INSPECTOR_REQUIRED');
  const contextDigest=sha(canonical(context)); const ledger=new Map();
  if (descriptors.priorJournal) {
    const prior=copy(descriptors.priorJournal.value);
    need(exact(prior,['schema','contextDigest','records','scope']) && prior.schema===JOURNAL_SCHEMA
      && prior.contextDigest===contextDigest && Array.isArray(prior.records) && prior.records.length<=1,
    'ENTERPRISE_JOURNAL_CONTEXT');
    for(const row of prior.records) {
      need(exact(row,['key','requestDigest','transportDigest','state','nativeReceiptDigest','nativeReservationUnresolved'])
        && row.key===contextDigest && hash(row.requestDigest) && hash(row.transportDigest)
        && ['PENDING','INSPECTED','INCONCLUSIVE'].includes(row.state)
        && (row.nativeReceiptDigest===null || hash(row.nativeReceiptDigest))
        && typeof row.nativeReservationUnresolved==='boolean' && !ledger.has(row.key), 'ENTERPRISE_JOURNAL_RECORD');
      ledger.set(row.key,freeze(row));
    }
  }
  const exportJournal=()=>copy({schema:JOURNAL_SCHEMA,contextDigest,records:[...ledger.values()],
    scope:'CURRENT_RECEIVER_CUSTODY_ONLY; persist in existing mission history; restored evidence grants no authority'});
  async function receive(raw) {
    const began=performance.now();let nativeInvoked=false,nativeReceipt=null,nativeChecked=false,effectiveLimits=null,record=null,result=null;
    const ownUsed={checkingUnits:RECEIVER_ADMISSION_UNITS,elapsedMs:0,memoryBytes:0};
    try {
      need(typeof raw==='string' && raw.length<=MAX_INPUT_BYTES,'ENTERPRISE_BOUNDED_RAW_TRANSPORT_REQUIRED');
      const rawBytes=bytes(raw); need(rawBytes<=MAX_INPUT_BYTES,'ENTERPRISE_INPUT_BYTES_EXCEEDED');
      ownUsed.memoryBytes=rawBytes;
      const transport=parseBounded(raw); need(exact(transport,['request','docket']),'ENTERPRISE_TRANSPORT_FIELDS');
      const request=transport.request;
      need(exact(request,REQUEST_KEYS) && request.schema==='autonomous-enterprise-native-request/v1','ENTERPRISE_REQUEST_SCHEMA');
      need(same(request.route,ROUTE),'ENTERPRISE_WRONG_ROUTE_OR_TOKEN');
      need(same(request.authority,[]) && request.externalSubmission==='NOT_SUBMITTED' && request.settlement==='NOT_RUN',
        'ENTERPRISE_IMPORTED_AUTHORITY');
      need(same(request.source,context.source) && same(request.binding,context.binding)
        && request.inspectionId===context.inspectionId && request.logicalCommissionId===context.logicalCommissionId
        && same(request.limits,context.limits),'ENTERPRISE_STALE_OR_SWAPPED_CONTEXT');
      need(!ledger.has(contextDigest),'ENTERPRISE_DUPLICATE_OR_UNCERTAIN_INSPECTION');
      const requestDigest=sha(canonical(request)), transportDigest=sha(raw);
      const reconciliationKey=sha(canonical({schema:'autonomous-enterprise-native-reconciliation-key/v1',
        source:request.source,binding:request.binding,inspectionId:request.inspectionId,
        logicalCommissionId:request.logicalCommissionId,route:request.route}));
      record={key:contextDigest,requestDigest,transportDigest,state:'PENDING',nativeReceiptDigest:null,nativeReservationUnresolved:true};
      ledger.set(contextDigest,record);
      const contextBytes=bytes(canonical(context));
      // Reserve the escaped original transport, repeated context, bounded native report and fixed/reason framing.
      const receiptReserve=2*rawBytes+2*contextBytes+MAX_INPUT_BYTES+262_144;
      const workingBytes=4*rawBytes+2*contextBytes;
      const receiverReservation={checkingUnits:RECEIVER_ADMISSION_UNITS,elapsedMs:elapsed(began),
        memoryBytes:workingBytes+receiptReserve};
      ownUsed.memoryBytes=workingBytes; ownUsed.elapsedMs=elapsed(began);
      const available=fits(receiverReservation,context.limits)
        && context.limits.checkingUnits>=2*RECEIVER_ADMISSION_UNITS;
      if(available) {
        effectiveLimits=Object.fromEntries(RESOURCE_KEYS.map(k=>[k,context.limits[k]-receiverReservation[k]]));
        nativeInvoked=true;
        nativeReceipt=copy(await inspector(freeze(copy(request)),context,
          freeze({docket:copy(transport.docket),effectiveLimits:{...effectiveLimits}})));
        need(exact(nativeReceipt,RECEIPT_KEYS) && nativeReceipt.schema==='autonomous-enterprise-native-inspection/v1'
          && ['ACCEPTED_LOCAL_INSPECTION','REJECTED','INCONCLUSIVE'].includes(nativeReceipt.state)
          && nativeReceipt.accepted===(nativeReceipt.state==='ACCEPTED_LOCAL_INSPECTION'), 'ENTERPRISE_NATIVE_REPORT');
        resources(nativeReceipt.resourceUsed);
        need(Array.isArray(nativeReceipt.reasons) && nativeReceipt.reasons.length<=32
          && nativeReceipt.reasons.every(x=>typeof x==='string' && x.length<=1000), 'ENTERPRISE_NATIVE_REPORT_REASONS');
        const queueFullNotStarted=nativeReceipt.state==='INCONCLUSIVE' && nativeReceipt.accepted===false
          && ['requestDigest','reconciliationKey','binding','route','source','payloadDigest','docketDigest','historicalState']
            .every(k=>nativeReceipt[k]===null) && nativeReceipt.work?.knownReplayWork===0
          && nativeReceipt.work?.unknownPartialReplay===false && nativeReceipt.resourceUsed.memoryBytes===0
          && same(nativeReceipt.reasons,['NATIVE_INSPECTION_QUEUE_FULL_NOT_STARTED']);
        const preflightIncomplete=nativeReceipt.state==='INCONCLUSIVE' && nativeReceipt.requestDigest===null
          && nativeReceipt.reconciliationKey===null && nativeReceipt.work?.knownReplayWork===0
          && nativeReceipt.reasons.every(x=>['NATIVE_INSPECTION_PREFLIGHT_INCOMPLETE','NATIVE_INSPECTION_LIMIT_EXHAUSTED',
            'NATIVE_INSPECTION_QUEUE_DEADLINE'].includes(x));
        const completedPreReplayRejection=nativeReceipt.state==='REJECTED' && nativeReceipt.requestDigest===requestDigest
          && nativeReceipt.reconciliationKey===null && nativeReceipt.work?.knownReplayWork===0
          && nativeReceipt.work?.unknownPartialReplay===false && nativeReceipt.historicalState===null
          && same(nativeReceipt.reasons,['NATIVE_CONTEXT_OR_COMMITMENT_MISMATCH']);
        need(queueFullNotStarted || ((preflightIncomplete || completedPreReplayRejection || nativeReceipt.requestDigest===requestDigest
          && nativeReceipt.reconciliationKey===reconciliationKey)
          && same(nativeReceipt.binding,context.binding) && same(nativeReceipt.source,context.source)
          && same(nativeReceipt.route,ROUTE) && nativeReceipt.payloadDigest===request.payloadDigest
          && nativeReceipt.docketDigest===request.docketDigest), 'ENTERPRISE_NATIVE_REPORT_BINDING');
        need(same(nativeReceipt.authority,[]) && nativeReceipt.externalSubmission==='NOT_SUBMITTED'
          && nativeReceipt.settlement==='NOT_RUN' && nativeReceipt.reconciliation==='RECEIVER_HISTORY_COMMIT_REQUIRED'
          && nativeReceipt.scope==='LOCAL_FIXED_SOURCE_INSPECTION_ONLY', 'ENTERPRISE_NATIVE_REPORT_AUTHORITY');
        need(exact(nativeReceipt.work,['admissionUnits','knownReplayWork','unknownPartialReplay','measurement'])
          && nativeReceipt.work.admissionUnits===10_000 && integer(nativeReceipt.work.knownReplayWork)
          && typeof nativeReceipt.work.unknownPartialReplay==='boolean' && nativeReceipt.work.measurement===NATIVE_MEASUREMENT
          && nativeReceipt.resourceUsed.checkingUnits===10_000+nativeReceipt.work.knownReplayWork, 'ENTERPRISE_NATIVE_WORK_RECEIPT');
        need(nativeReceipt.historicalState===null || exact(nativeReceipt.historicalState,
          ['state','unknownConstructionSpent','unresolvedReservation','futureSpent','successorSpent']), 'ENTERPRISE_NATIVE_HISTORICAL_STATE');
        const historical=nativeReceipt.historicalState;
        if(historical) need(historical.state===context.binding.state
          && typeof historical.unknownConstructionSpent==='boolean' && typeof historical.unresolvedReservation==='boolean'
          && spent(historical.futureSpent) && spent(historical.successorSpent), 'ENTERPRISE_NATIVE_HISTORICAL_VALUES');
        if(nativeReceipt.accepted) need(!nativeReceipt.work.unknownPartialReplay && historical
          && !historical.unknownConstructionSpent && !historical.unresolvedReservation
          && acceptedHistoricalStates.includes(historical.state)
          && historical.futureSpent!=='unknown-reservation-retained' && historical.successorSpent!=='unknown-reservation-retained'
          && nativeReceipt.reasons.length===0, 'ENTERPRISE_NATIVE_UNRESOLVED_ACCEPTANCE');
        else need(nativeReceipt.reasons.length>0,'ENTERPRISE_NATIVE_REASON_REQUIRED');
        nativeChecked=true;
      }
      const nativeUsed=nativeReceipt?.resourceUsed || {checkingUnits:0,elapsedMs:0,memoryBytes:0};
      result={schema:RECEIVER_SCHEMA,state:'INCONCLUSIVE',originalTransport:raw,transportDigest,requestDigest,
        contextDigest,reconciliationKey,inspectionId:context.inspectionId,logicalCommissionId:context.logicalCommissionId,
        route:{...ROUTE},binding:copy(context.binding),source:{...source},nativeReceipt,
        resourceUsed:{checkingUnits:ownUsed.checkingUnits+nativeUsed.checkingUnits,elapsedMs:elapsed(began),memoryBytes:0},
        receiverResourceUsed:{...ownUsed},nativeResourceReservation:effectiveLimits,reservationAvailable:available,
        reason:available?'NATIVE_CHECK_INCOMPLETE':'RECEIVER_RESERVATION_UNAVAILABLE',
        authority:[],externalSubmission:'NOT_SUBMITTED',settlement:'NOT_RUN',currencyCapBaseUnits:'0',
        reconciliation:'RECEIVER_HISTORY_COMMIT_REQUIRED',installedSourceCaptureQualified:false,
        custody:'Original transport and native receipt returned for the existing mission and thirteen-section docket.'};
      const nativeUnresolved=unresolvedNative(nativeReceipt);
      // All result data is receiver-owned or already captured inert JSON. Key ordering cannot change byte count.
      // Output uses its reserved bound; the shared canonicalizer's 2 MB input ceiling is unchanged.
      const receiptSize=()=>{resources(result.resourceUsed);resources(result.receiverResourceUsed);
        const count=bytes(JSON.stringify(result));
        need(count<=receiptReserve,'ENTERPRISE_RECEIPT_RESERVATION_EXCEEDED');return count;};
      for(let i=0;i<8;i++) {
        result.receiverResourceUsed.memoryBytes=workingBytes+receiptSize();
        result.receiverResourceUsed.elapsedMs=elapsed(began);
        result.resourceUsed={checkingUnits:ownUsed.checkingUnits+nativeUsed.checkingUnits,elapsedMs:elapsed(began),
          memoryBytes:result.receiverResourceUsed.memoryBytes+nativeUsed.memoryBytes};
        resources(result.resourceUsed);
        const within=available && fits(nativeUsed,effectiveLimits) && fits(result.resourceUsed,context.limits);
        result.state=!within || nativeUnresolved || nativeReceipt.state==='INCONCLUSIVE'?'INCONCLUSIVE'
          :nativeReceipt.state==='ACCEPTED_LOCAL_INSPECTION'?'LOCAL_CHECKED':'LOCAL_REJECTED';
        result.reason=!within?'RESOURCE_RESERVATION_OR_CAP_INCOMPLETE':nativeUnresolved
          ?'NATIVE_REPLAY_OR_HISTORY_UNRESOLVED; '+nativeReceipt.reasons.join('; '):nativeReceipt.reasons.join('; ');
      }
      record.state=result.state==='INCONCLUSIVE'?'INCONCLUSIVE':'INSPECTED';
      record.nativeReceiptDigest=nativeReceipt?sha(canonical(nativeReceipt)):null;
      record.nativeReservationUnresolved=nativeUnresolved; ledger.set(contextDigest,freeze({...record}));
      const digits=vector=>RESOURCE_KEYS.reduce((total,k)=>total+String(vector[k]).length,0);
      const variableBytes=()=>result.state.length+bytes(JSON.stringify(result.reason))
        +digits(result.resourceUsed)+digits(result.receiverResourceUsed);
      const serializedBytes=receiptSize(), serializedVariables=variableBytes();
      const finalSample=()=>{
        result.receiverResourceUsed.elapsedMs=elapsed(began);result.resourceUsed.elapsedMs=result.receiverResourceUsed.elapsedMs;
        for(let i=0;i<8;i++){
          const within=available && fits(nativeUsed,effectiveLimits) && fits(result.resourceUsed,context.limits);
          if(!within){result.state='INCONCLUSIVE';result.reason='RESOURCE_RESERVATION_OR_CAP_INCOMPLETE';}
          const receiptBytes=serializedBytes-serializedVariables+variableBytes();
          const resident=workingBytes+receiptBytes;
          if(result.receiverResourceUsed.memoryBytes===resident)return;
          result.receiverResourceUsed.memoryBytes=resident;result.resourceUsed.memoryBytes=resident+nativeUsed.memoryBytes;
          resources(result.resourceUsed);
        }
        need(false,'ENTERPRISE_RECEIPT_DID_NOT_CONVERGE');
      };
      finalSample();finalSample();
      record.state=result.state==='INCONCLUSIVE'?'INCONCLUSIVE':'INSPECTED';
      ledger.set(contextDigest,freeze({...record}));
      return freeze(result);
    } catch(error) {
      ownUsed.elapsedMs=elapsed(began);
      const knownReceiver=result?{...result.receiverResourceUsed,elapsedMs:ownUsed.elapsedMs}:ownUsed;
      const uncertain=nativeInvoked && (!nativeChecked || unresolvedNative(nativeReceipt));
      if(record) ledger.set(contextDigest,freeze({...record,state:'INCONCLUSIVE',
        nativeReceiptDigest:nativeChecked?sha(canonical(nativeReceipt)):record.nativeReceiptDigest,
        nativeReservationUnresolved:uncertain}));
      throw ownedFailure(error,knownReceiver,effectiveLimits,uncertain,nativeChecked?nativeReceipt:null,
        record?raw:null,record?.transportDigest || null);
    }
  }
  return Object.freeze({receive,exportJournal,capabilities:enterpriseReceiverCapabilities});
}
