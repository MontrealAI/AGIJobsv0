'use strict';

const { createHash } = require('node:crypto');
const policy = require('../../config/solidity-compiler.json');

function checkCompiler(build) {
  const settings = build?.input?.settings;
  if (
    build?.diagnostic === true ||
    build?.compilerProvenance?.diagnostic === true ||
    (build?.compilerProvenance?.actualVersion !== undefined &&
      build.compilerProvenance.actualVersion !== build.solcLongVersion) ||
    build?.solcVersion !== policy.version ||
    build?.solcLongVersion !== policy.longVersion ||
    settings?.viaIR !== policy.viaIR ||
    settings?.optimizer?.enabled !== true ||
    settings?.optimizer?.runs !== policy.optimizerRuns ||
    settings?.optimizer?.details !== undefined ||
    settings?.evmVersion !== policy.evmVersion ||
    settings.metadata?.appendCBOR === false ||
    (settings.metadata?.bytecodeHash !== undefined &&
      settings.metadata.bytecodeHash !== 'ipfs')
  ) {
    throw new Error(
      `Production artifacts require Solidity ${policy.longVersion}, viaIR, 200 optimizer runs, Cancun and IPFS metadata. Recompile without fast/coverage overrides. Reproduce existing deployments from their original release.`
    );
  }
}

function checkDiagnostics(build) {
  const diagnostics = build.output?.errors ?? [];
  if (!Array.isArray(diagnostics))
    throw new Error('Malformed compiler diagnostics');
  const reviewed = [];
  const counts = new Map();
  for (const diagnostic of diagnostics) {
    const file = diagnostic.sourceLocation?.file;
    const entry = policy.reviewedUpstreamWarnings.find(
      (item) => item.file === file && item.errorCode === diagnostic.errorCode
    );
    const source = build.input?.sources?.[file]?.content;
    const count = (counts.get(file) ?? 0) + 1;
    counts.set(file, count);
    const sourceHash =
      typeof source === 'string'
        ? createHash('sha256').update(source).digest('hex')
        : null;
    if (
      diagnostic.severity !== 'warning' ||
      !entry ||
      sourceHash !== entry.sourceSha256 ||
      count > entry.maximumCount
    ) {
      throw new Error(
        `Unreviewed compiler diagnostic ${
          diagnostic.errorCode ?? 'unknown'
        } in ${file ?? 'compiler'}: ${diagnostic.message ?? 'missing message'}`
      );
    }
    reviewed.push({
      file,
      errorCode: diagnostic.errorCode,
      message: diagnostic.message,
    });
  }
  return reviewed;
}

function checkDiagnosticCompiler(build) {
  if (
    build?.compilerProvenance?.actualVersion !==
    `${policy.longVersion}.Emscripten.clang`
  )
    throw new Error('Unknown diagnostic compiler provenance');
  checkCompiler({
    ...build,
    diagnostic: false,
    compilerProvenance: undefined,
    solcLongVersion: policy.longVersion,
  });
}
module.exports = {
  policy,
  checkCompiler,
  checkDiagnosticCompiler,
  checkDiagnostics,
};
