#!/usr/bin/env node
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  readdirSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { canonicalize, digestObject } from '../src/integrity.mjs';
import { validateMission } from '../src/domain.mjs';
import { compileJobs, sealWorkOrder } from '../src/compiler.mjs';
import { createInvoiceJobs, createInvoiceEdges } from '../src/invoice.mjs';
import {
  createWorkbenchMission,
  runMissionJourney,
  packJourney,
} from '../src/journeys.mjs';
import {
  verifyMissionPack,
  restoreMissionPack,
  createSuccessor,
} from '../src/pack.mjs';
import { registerCompilation } from '../src/institution.mjs';
import { openStore, recordKnowledge } from '../src/store.mjs';
import {
  freezeCandidate,
  validateProtocol,
  verifyProof,
} from '../src/proof.mjs';
import {
  admitCandidate,
  revokeAuthority,
  impairDependencies,
} from '../src/authority.mjs';
import { verifySignedPayload } from '../src/signatures.mjs';
import { examineWorldJourney } from '../src/examination.mjs';

const usage = `SUCCESSOR Ω — local institutional tools (no live effect driver)
Usage: npm run successor -- <group> <command> [--file input.json] [--out output.json]
  mission init|validate|run|stop [--mission invoice|world|resources] [--state institution.sqlite]
  jobs compile|seal --file constitution-or-work-order.json
  candidate search [--mission world|resources] | freeze --file complete-manifest.json
  proof request --file candidate-and-protocol.json
  proof verify --file proof-bundle.json --trust operator-trust.json
  admission record --file decision-bundle.json --trust operator-trust.json --signer principal-key.json
  authority inspect|revoke --state institution.sqlite --id permission-id
  chronicle inspect --state institution.sqlite [--checkpoint retained-head.json]
  pack export [--mission invoice|world|resources] | verify|restore --file pack.json
  successor create --file pack.json --id descendant-id --supplier local-supplier-b
  demo [--out reports/successor/run-directory] | verify
All default missions are public synthetic A0/A1 analysis; no wallet, API key or model download.
Signed proof/admission imports require separately provisioned trust. Restoring knowledge restores no authority.`;
function error(code, message) {
  throw Object.assign(new Error(message), { code });
}
function parse(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]))
    return { options: {}, words: ['help'] };
  const options = {};
  const words = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (
        ![
          'file',
          'out',
          'mission',
          'state',
          'trust',
          'signer',
          'id',
          'supplier',
          'checkpoint',
          'actor',
          'reason',
        ].includes(key)
      )
        error('USAGE', `Unknown option ${arg}`);
      if (!args[i + 1] || args[i + 1].startsWith('--'))
        error('USAGE', `${arg} requires a value`);
      if (key in options) error('USAGE', `Duplicate option ${arg}`);
      options[key] = args[++i];
    } else words.push(arg);
  }
  if (words.length > 2) error('USAGE', 'Too many positional arguments.');
  return { options, words };
}
function readJson(path) {
  if (!path) error('INPUT_REQUIRED', 'An explicit input file is required.');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024)
    error(
      'INPUT_LIMIT',
      'Input must be a regular JSON file of at most 16 MiB.'
    );
  const value = JSON.parse(readFileSync(path, 'utf8'));
  canonicalize(value);
  return value;
}
function save(path, value) {
  mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
}
function stateStore(options) {
  if (!options.state)
    error(
      'STATE_REQUIRED',
      'Select an explicit operator-owned SQLite state file.'
    );
  return openStore(options.state, {
    expectedCheckpoint: options.checkpoint
      ? readJson(options.checkpoint)
      : undefined,
  });
}
function checkoutMetadata() {
  try {
    return {
      tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
        encoding: 'utf8',
        cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
      }).trim(),
      revision: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
      }).trim(),
      dirty:
        execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
          cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
        }).trim().length > 0,
    };
  } catch {
    return { revision: null, tree: null, dirty: null };
  }
}
async function sourceFingerprint() {
  const actual = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
  const files = {};
  for (const name of readdirSync(actual)
    .filter((name) => name.endsWith('.mjs'))
    .sort())
    files[name] = await digestObject(
      'successor.source-file.v1',
      readFileSync(join(actual, name), 'utf8')
    );
  for (const [name, path] of [
    ['cli', fileURLToPath(import.meta.url)],
    ['package', resolve(actual, '../package.json')],
    ['lockfile', resolve(actual, '../../../package-lock.json')],
  ])
    files[name] = await digestObject(
      'successor.source-file.v1',
      readFileSync(path, 'utf8')
    );
  return digestObject('successor.source-manifest.v1', files);
}

export async function runDemo({ out } = {}) {
  const started = performance.now();
  const runId = randomUUID();
  const directory = resolve(
    out ?? join(process.cwd(), 'reports/successor', `run-${runId}`)
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const journeys = {};
  for (const name of ['invoice', 'world', 'resources']) {
    journeys[name] = await runMissionJourney(name);
    save(join(directory, `${name}.json`), journeys[name]);
  }
  const sourceDigest = await sourceFingerprint();
  const examination = await examineWorldJourney(journeys.world, {
    sourceDigest,
  });
  save(join(directory, 'world-examination.json'), examination);
  save(join(directory, 'world-examination-trust.json'), examination.trustStore);
  const pack = await packJourney(journeys.invoice);
  await verifyMissionPack(pack);
  const restored = await restoreMissionPack(JSON.parse(JSON.stringify(pack)));
  const descendant = await createSuccessor(restored, {
    id: 'invoice-successor-2',
    supplier: 'deterministic-local-rules-b',
  });
  const store = openStore(join(directory, 'institution.sqlite'));
  try {
    const registration = await registerCompilation(
      store,
      journeys.invoice.compilation,
      {
        actor: 'fixture-operator',
        eventId: `${runId}:register`,
        now: '2026-10-08T00:00:00Z',
      }
    );
    store.transact(
      (state) => {
        state.events.push({
          id: runId,
          type: 'MISSION_REHEARSAL_RECORDED',
          missionId: journeys.invoice.mission.missionId,
          receiptDigests: journeys.invoice.receipts.map(
            (receipt) => receipt.digest
          ),
          mode: 'fixture',
        });
      },
      {
        eventId: `${runId}:run`,
        actor: 'fixture-operator',
        reason:
          'Record synthetic mission execution; acceptance and admission pending',
      }
    );
    recordKnowledge(
      store,
      {
        id: 'negative-result',
        kind: 'negative-knowledge',
        status: 'proposed',
        scope: journeys.world.mission.objective,
        rights: 'synthetic MIT',
        sources: [await digestObject('successor.rehearsal.v1', journeys.world)],
        producer: 'fixture-producer',
        claim:
          'Retain unsafe hypotheses and the stronger-comparator no-advantage result.',
      },
      {
        actor: 'fixture-producer',
        role: 'producer',
        eventId: `${runId}:knowledge`,
      }
    );
    const invalidation = impairDependencies(store, {
      sourceIds: [registration.result.sourceReferences.invoice],
      actor: 'fixture-operator',
      eventId: `${runId}:rights-loss`,
      reason:
        'Synthetic rights-loss rehearsal; halt dependent work without erasing history.',
    }).result;
    const checkpoint = store.head();
    save(join(directory, 'chronicle-checkpoint.json'), checkpoint);
    store.verify(checkpoint);
    const { runProofRehearsal } = await import('../src/proof-rehearsal.mjs');
    const proof = await runProofRehearsal();
    save(join(directory, 'proof-rehearsal.json'), proof);
    save(join(directory, 'mission-pack.json'), pack);
    save(join(directory, 'restored.json'), restored);
    save(join(directory, 'descendant.json'), descendant);
    const report = {
      schemaVersion: '1.0.0',
      mode: 'SYNTHETIC_REHEARSAL',
      runId,
      node: process.version,
      checkout: checkoutMetadata(),
      sourceDigest,
      examination: {
        candidateDigest: examination.candidate.candidateDigest,
        proofDigest: examination.internalVerification.digest,
        verdict: examination.report.verdict,
        caseCount: examination.publicCaseCount,
        independence: examination.proof.payload.independence,
        independentAdmission: examination.independentAdmission,
        artifact: 'world-examination.json',
      },
      invoice: {
        recommendation: journeys.invoice.dossier.recommendation,
        sealedJobs: journeys.invoice.receipts.length,
        externalActions: 0,
        accepted: false,
      },
      world: journeys.world.workbench,
      resources: journeys.resources.workbench,
      proof,
      portability: {
        packDigest: pack.digest,
        artifactCount: pack.artifacts.length,
        restoredAuthorityCount: restored.activeAuthority.length,
        descendantProof: descendant.proofCurrency,
        supplierSubstitution: journeys.world.workbench.supplierSubstitution,
      },
      invalidation,
      chronicle: checkpoint,
      elapsedMs: Math.round(performance.now() - started),
      directory,
      externalGates: [
        'independent examination custody and trust',
        'live runtime commissioning',
        'production signing and repository release gates',
      ],
    };
    save(join(directory, 'release-evidence.json'), report);
    return report;
  } finally {
    store.close();
  }
}
async function dispatch(words, options) {
  const [group, command] = words;
  if (!group || ['help', '--help'].includes(group)) {
    return { help: usage };
  }
  if (group === 'demo') {
    const report = await runDemo(options);
    return {
      mode: report.mode,
      sourceDigest: report.sourceDigest,
      invoice: report.invoice,
      world: {
        alpha: report.world.alpha,
        developmentCases: report.world.developmentCount,
        examination: report.examination,
      },
      resources: {
        alpha: report.resources.alpha,
        energyConserved: report.resources.resourcePlan.energyConserved,
      },
      proof: {
        independence: report.proof.independence,
        independentAdmission: report.proof.independentAdmission,
        runtime: report.proof.runtime,
      },
      portability: {
        packDigest: report.portability.packDigest,
        restoredAuthorityCount: report.portability.restoredAuthorityCount,
        descendantProof: report.portability.descendantProof,
        suppliers: report.portability.supplierSubstitution.suppliers.map(
          (s) => s.id
        ),
        compatibility: {
          cases: report.portability.supplierSubstitution.compatibility.cases,
          equivalent:
            report.portability.supplierSubstitution.compatibility.equivalent,
        },
      },
      elapsedMs: report.elapsedMs,
      evidence: join(report.directory, 'release-evidence.json'),
      externalGates: report.externalGates,
    };
  }
  if (group === 'verify') {
    const directory =
      options.out ??
      join(process.cwd(), 'reports/successor', `verify-${randomUUID()}`);
    const report = await runDemo({ out: directory });
    if (
      report.examination.verdict !== 'FAIL' ||
      report.examination.caseCount !== 60 ||
      report.examination.independence !== 'I0' ||
      report.examination.independentAdmission.allowed !== false ||
      report.invoice.recommendation !== 'HOLD_AND_ESCALATE' ||
      report.invoice.externalActions !== 0 ||
      report.portability.restoredAuthorityCount !== 0 ||
      report.portability.descendantProof !== 'absent' ||
      report.world.alpha.status !== 'ABSENT' ||
      report.resources.alpha.status !== 'ABSENT' ||
      report.resources.resourcePlan.energyConserved !== true ||
      report.proof.independentAdmission.allowed !== false ||
      report.proof.strongerAlternative.verdict !== 'FAIL' ||
      report.proof.unsafePatch.verdict !== 'FAIL' ||
      report.proof.runtime.driverCalls !== 1 ||
      report.proof.runtime.revocationCode !== 'AUTHORITY_REVOKED'
    )
      error(
        'REHEARSAL_FAILED',
        'One or more institutional rehearsal invariants failed.'
      );
    return {
      valid: true,
      mode: report.mode,
      sourceDigest: report.sourceDigest,
      evidence: join(directory, 'release-evidence.json'),
      externalGates: report.externalGates,
    };
  }
  if (group === 'mission' && command === 'init')
    return createWorkbenchMission(options.mission);
  if (group === 'mission' && command === 'validate')
    return { valid: true, mission: validateMission(readJson(options.file)) };
  if (group === 'mission' && command === 'run') {
    if (!options.state) return runMissionJourney(options.mission);
    const store = stateStore(options);
    try {
      if (store.read().stopped)
        error(
          'EMERGENCY_STOP',
          'Institution is stopped; explicit accountable recovery is required.'
        );
      const result = await runMissionJourney(options.mission);
      store.transact(
        (state) => {
          if (state.stopped)
            error('EMERGENCY_STOP', 'Institution was stopped during analysis.');
          state.events.push({
            type: 'MISSION_REHEARSAL',
            missionId: result.mission.missionId,
            mode: 'fixture',
          });
        },
        {
          actor: options.actor ?? 'local-operator',
          reason: 'Record bounded read-only mission rehearsal',
        }
      );
      return result;
    } finally {
      store.close();
    }
  }
  if (group === 'mission' && command === 'stop') {
    const store = stateStore(options);
    try {
      return store.transact(
        (state) => {
          state.stopped = true;
        },
        {
          actor: options.actor ?? 'local-operator',
          reason: options.reason ?? 'Explicit emergency stop',
        }
      );
    } finally {
      store.close();
    }
  }
  if (group === 'jobs' && command === 'compile') {
    const mission = readJson(options.file);
    return compileJobs(
      mission,
      mission.missionId === 'invoice-integrity-synthetic-v1'
        ? {
            jobs: createInvoiceJobs(mission),
            edges: createInvoiceEdges(mission),
          }
        : {}
    );
  }
  if (group === 'jobs' && command === 'seal')
    return sealWorkOrder(readJson(options.file));
  if (group === 'candidate' && command === 'search')
    return runMissionJourney(options.mission ?? 'world');
  if (group === 'candidate' && command === 'freeze')
    return freezeCandidate(readJson(options.file));
  if (group === 'proof' && command === 'request') {
    const { candidate, protocol } = readJson(options.file);
    const validated = await validateProtocol(protocol, candidate);
    return {
      kind: 'ProofRequest',
      candidateDigest: candidate.candidateDigest,
      protocolDigest: validated.protocolDigest,
      status: 'REQUESTED_NOT_PROVEN',
      authorityCreated: 'NONE',
    };
  }
  if (group === 'proof' && command === 'verify') {
    const { proof, candidate, protocol, context } = readJson(options.file);
    const fixture = context?.mode === 'fixture';
    const result = await verifyProof(proof, {
      candidate,
      protocol,
      context,
      trustStore: readJson(options.trust),
      requireIndependent: !fixture,
    });
    return {
      valid: true,
      digest: result.digest,
      verdict: result.payload.verdict,
      independence: result.payload.independence,
      verificationClass: fixture
        ? 'INTERNAL_FIXTURE_INTEGRITY'
        : 'INDEPENDENT_PROOF',
      authorityCreated: 'NONE',
    };
  }
  if (group === 'admission' && command === 'record') {
    const bundle = readJson(options.file);
    const trustStore = readJson(options.trust);
    const identity = readJson(options.signer);
    const admission = await admitCandidate({ ...bundle, identity, trustStore });
    const verifiedAdmission = await verifySignedPayload(admission, {
      trustStore,
      purpose: 'successor.admission.v1',
      role: 'principal',
      context: bundle.context,
    });
    if (options.state) {
      const store = stateStore(options);
      try {
        store.transact(
          (state) => {
            state.admissions[verifiedAdmission.digest] = {
              status: 'granted',
              candidateDigest: admission.payload.candidateDigest,
              proofDigest: admission.payload.proofDigest,
              record: admission,
            };
          },
          {
            actor: identity.keyId,
            reason: 'Record explicitly signed independent admission',
          }
        );
      } finally {
        store.close();
      }
    }
    return admission;
  }
  if (group === 'authority' && ['inspect', 'revoke'].includes(command)) {
    const store = stateStore(options);
    try {
      if (command === 'inspect')
        return {
          id: options.id ?? null,
          authority: options.id
            ? store.read().authorities[options.id] ?? null
            : store.read().authorities,
          revocationEpochs: store.read().revocationEpochs,
        };
      if (!options.id)
        error(
          'ID_REQUIRED',
          'Select the exact authority identifier to revoke.'
        );
      return revokeAuthority(store, options.id, {
        actor: options.actor ?? 'local-operator',
        reason: options.reason ?? 'Explicit operator revocation',
        eventId: randomUUID(),
      });
    } finally {
      store.close();
    }
  }
  if (group === 'chronicle' && command === 'inspect') {
    const store = stateStore(options);
    try {
      const result = store.verify();
      return {
        ...result,
        entries: store.entries(),
        limitation: result.checkpointVerified
          ? 'Matches independently supplied checkpoint.'
          : 'Local chain consistency only; retain a separate latest-head checkpoint to detect truncation.',
      };
    } finally {
      store.close();
    }
  }
  if (group === 'pack' && command === 'export')
    return packJourney(
      options.file
        ? readJson(options.file)
        : await runMissionJourney(options.mission)
    );
  if (group === 'pack' && command === 'verify')
    return verifyMissionPack(readJson(options.file));
  if (group === 'pack' && command === 'restore')
    return restoreMissionPack(readJson(options.file));
  if (group === 'successor' && command === 'create')
    return createSuccessor(await restoreMissionPack(readJson(options.file)), {
      id: options.id,
      supplier: options.supplier,
    });
  error('USAGE', `Unknown command.\n${usage}`);
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { words, options } = parse(process.argv.slice(2));
    const result = await dispatch(words, options);
    if (result.help) {
      console.log(result.help);
    } else if (options.out && !['demo', 'verify'].includes(words[0])) {
      save(options.out, result);
      console.log(JSON.stringify({ written: resolve(options.out) }));
    } else console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: {
          code: error.code ?? 'INVALID_INPUT',
          message: error.message,
          retryable: false,
        },
      })
    );
    process.exitCode = 1;
  }
}
