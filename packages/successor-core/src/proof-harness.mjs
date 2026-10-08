#!/usr/bin/env node
// Separate executable with no network, wallet, production effect driver or
// embedded evaluator secret. Protected evaluation requires external custody.
import { readJsonFile } from './json-file.mjs';
import { pathToFileURL } from 'node:url';
import { runProofRehearsal } from './proof-rehearsal.mjs';
import { verifyProof } from './proof.mjs';

export async function runHarness(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--fixture') return runProofRehearsal();
  const names = [
    '--verify',
    '--trust',
    '--candidate',
    '--protocol',
    '--context',
  ];
  if (args.length !== 10 || names.some((name, i) => args[i * 2] !== name))
    throw Object.assign(
      new Error(
        'Use --fixture, or --verify RECEIPT --trust TRUST --candidate MANIFEST --protocol PROTOCOL --context CONTEXT. Live examination and signing are external custody responsibilities.'
      ),
      { code: 'INVALID_ARGUMENTS' }
    );
  const [receipt, trustStore, candidate, protocol, context] = await Promise.all(
    names.map((_, i) =>
      readJsonFile(args[i * 2 + 1], { maxBytes: 8 * 1024 * 1024 })
    )
  );
  const verified = await verifyProof(receipt, {
    trustStore,
    candidate,
    protocol,
    context,
    now: Date.now(),
  });
  let admissionEligible = false;
  let admissionCode;
  try {
    await verifyProof(receipt, {
      trustStore,
      candidate,
      protocol,
      context,
      now: Date.now(),
      requireIndependent: true,
    });
    admissionEligible = true;
    admissionCode = 'PROOF_ELIGIBLE_FOR_SEPARATE_ADMISSION';
  } catch (error) {
    admissionCode = error.code || 'INVALID_PROOF';
  }
  return {
    schemaVersion: 1,
    signatureVerified: true,
    digest: verified.digest,
    verdict: verified.payload.verdict,
    independence: verified.payload.independence,
    admissionEligible,
    admissionCode,
    authorityGranted: false,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runHarness()
    .then((result) =>
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    )
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({
          code: error.code || 'HARNESS_FAILED',
          message: error.message,
        })}\n`
      );
      process.exitCode = 1;
    });
}
