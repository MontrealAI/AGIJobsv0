#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ethers = require('ethers');
const {
  readJSON,
  readArchive,
  exclusiveJSON,
  sha256,
  digest,
  insist,
  safeError,
  explorerClient,
} = require('./evidence.cjs');
const { reconcile, journalTransactions } = require('./reconcile.cjs');
const { qualify, assertQualifiedActivation } = require('./qualification.cjs');
function parseArgs(args) {
  const options = { submit: false };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--submit') {
      insist(!options.submit, 'Duplicate --submit');
      options.submit = true;
      continue;
    }
    insist(
      [
        '--manifest',
        '--archive',
        '--output',
        '--qualification-output',
      ].includes(key),
      `Unknown option: ${key}`
    );
    insist(
      args[i + 1] && !args[i + 1].startsWith('--') && !options[key.slice(2)],
      `Missing or duplicate ${key}`
    );
    options[key.slice(2)] = args[++i];
  }
  insist(
    options.manifest && options.archive && options.output,
    'Usage: node scripts/verification/verify-release.cjs --manifest FILE --archive DIRECTORY --output NEW_FILE [--qualification-output NEW_FILE] [--submit]'
  );
  return options;
}
function loadManifest(file) {
  const manifest = readJSON(file);
  insist(
    Array.isArray(manifest.journals) && manifest.journals.length > 0,
    'Retained deployment journals are required'
  );
  const snapshots = [];
  for (const journal of manifest.journals) {
    const bytes = fs.readFileSync(
      path.resolve(path.dirname(file), journal.file)
    );
    insist(sha256(bytes) === journal.sha256, 'Journal hash mismatch');
    const lines = bytes.toString('utf8').trim().split('\n');
    for (const line of lines) {
      const snapshot = JSON.parse(line);
      insist(
        String(snapshot.chainId) === String(manifest.chainId),
        'Journal chain mismatch'
      );
      if (snapshot.verificationBundle?.indexSha256)
        insist(
          snapshot.verificationBundle.indexSha256 === manifest.archiveSha256,
          'Journal archive identity mismatch'
        );
      snapshots.push(snapshot);
    }
  }
  const configurations = new Set(
    snapshots.map((s) => s.configurationHash).filter(Boolean)
  );
  insist(
    configurations.size <= 1,
    'Journals contain different deployment configurations'
  );
  const recovered = journalTransactions(snapshots);
  const declared = new Map(
    (manifest.transactions || []).map((t) => [t.hash.toLowerCase(), t])
  );
  for (const tx of recovered.transactions) {
    insist(
      declared.has(tx.hash.toLowerCase()),
      `Manifest omitted journal transaction ${tx.hash}`
    );
    for (const key of [
      'from',
      'nonce',
      'input',
      'chainId',
      'fullyQualified',
      'constructorArguments',
    ])
      if (tx[key] !== undefined)
        insist(
          String(declared.get(tx.hash.toLowerCase())[key]).toLowerCase() ===
            String(tx[key]).toLowerCase(),
          `Manifest changed journal ${key}`
        );
  }
  for (const entry of manifest.reused || []) {
    insist(
      entry.reviewEvidenceFile &&
        /^[a-f0-9]{64}$/.test(entry.reviewEvidenceSha256 || ''),
      'Reused dependency needs a retained review evidence file and SHA256'
    );
    insist(
      sha256(
        fs.readFileSync(
          path.resolve(path.dirname(file), entry.reviewEvidenceFile)
        )
      ) === entry.reviewEvidenceSha256,
      'Reused dependency review evidence hash mismatch'
    );
  }
  return manifest;
}
async function guardFiles({
  provider,
  manifestFile,
  archiveDirectory,
  receiptFile,
  target,
  explorer,
}) {
  insist(
    manifestFile && archiveDirectory && receiptFile,
    'Unpause requires --manifest, --archive and --qualification'
  );
  const manifest = loadManifest(manifestFile),
    archive = readArchive(archiveDirectory, manifest.archiveSha256),
    receipt = readJSON(receiptFile);
  return assertQualifiedActivation({
    provider,
    manifest,
    archive,
    receipt,
    target,
    explorer:
      explorer || explorerClient({ apiKey: process.env.ETHERSCAN_API_KEY }),
  });
}
async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args),
    manifest = loadManifest(options.manifest),
    archive = readArchive(options.archive, manifest.archiveSha256);
  // No Hardhat, wallet, account discovery, signer or deployment code is loaded.
  const provider =
    dependencies.provider ||
    new ethers.JsonRpcProvider(process.env.VERIFICATION_RPC_URL);
  insist(
    dependencies.provider || process.env.VERIFICATION_RPC_URL,
    'VERIFICATION_RPC_URL is required'
  );
  const explorer =
    dependencies.explorer ||
    explorerClient({ apiKey: process.env.ETHERSCAN_API_KEY });
  insist(
    !fs.existsSync(options.output),
    'Output already exists; choose a new evidence filename'
  );
  if (options['qualification-output'])
    insist(
      !fs.existsSync(options['qualification-output']),
      'Qualification output already exists; choose a new filename'
    );
  let report;
  try {
    report = await reconcile({
      provider,
      archive,
      manifest,
      explorer,
      submit: options.submit,
    });
    exclusiveJSON(options.output, report);
    if (options['qualification-output']) {
      const receipt = await qualify({ provider, archive, manifest, report });
      exclusiveJSON(options['qualification-output'], receipt);
    }
    console.log(
      JSON.stringify({
        output: options.output,
        creations: report.creations.length,
        blockers: report.blockers,
        qualificationWritten: !!options['qualification-output'],
        mode: options.submit
          ? 'explorer-submission-only'
          : 'read-only dry-run; no signer',
      })
    );
    return report;
  } catch (error) {
    if (!report && !fs.existsSync(options.output))
      exclusiveJSON(options.output, {
        schema: 'agijobsv0/verification-failure/1',
        manifestSha256: digest(manifest),
        error: safeError(error),
        productionQualified: false,
      });
    throw error;
  } finally {
    if (!dependencies.provider) provider.destroy();
  }
}
if (require.main === module)
  main()
    .then((report) => {
      if (report.blockers.length) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(JSON.stringify(safeError(error)));
      process.exitCode = 1;
    });
module.exports = { main, parseArgs, loadManifest, guardFiles };
