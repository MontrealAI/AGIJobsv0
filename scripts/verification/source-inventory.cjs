'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  createVerifiedArtifactReader,
} = require('../deploy/verified-artifact.cjs');
const {
  checkCompiler,
  checkDiagnosticCompiler,
  checkDiagnostics,
} = require('../ci/solidity-policy.cjs');
const { inspectContract } = require('../release/check-contract-size.js');
const CORE = new Set([
  'Deployer',
  'JobRegistry',
  'StakeManager',
  'ValidationModule',
  'ReputationEngine',
  'DisputeModule',
  'CertificateNFT',
  'PlatformRegistry',
  'JobRouter',
  'PlatformIncentives',
  'FeePool',
  'TaxPolicy',
  'IdentityRegistry',
  'SystemPause',
  'ArbitratorCommittee',
]);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function sourcesUnder(root, relative = 'contracts') {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, relative), {
    withFileTypes: true,
  })) {
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) result.push(...sourcesUnder(root, name));
    else if (entry.isFile() && name.endsWith('.sol')) result.push(name);
  }
  return result.sort();
}
function classification(source, node, externallyLinked) {
  if (/\/(?:mocks?|test|coverage)\//.test(source)) return 'test/mock';
  if (node.contractKind === 'interface' || node.abstract)
    return 'abstract/interface';
  if (node.contractKind === 'library')
    return externallyLinked ? 'externally-linked-library' : 'inline-library';
  if (!source.startsWith('contracts/v2/')) return 'legacy/demo';
  return CORE.has(node.name) || source.includes('/implementation/')
    ? 'core'
    : 'optional-deployable';
}
function inspectSources(root = process.cwd(), options = {}) {
  const sourceNames = sourcesUnder(root);
  const read = createVerifiedArtifactReader(root, options);
  const buildDir = path.join(root, 'artifacts/build-info');
  const builds = fs
    .readdirSync(buildDir)
    .filter((n) => n.endsWith('.json'))
    .map((name) => {
      const file = path.join(buildDir, name),
        bytes = fs.readFileSync(file);
      return { file, bytes, build: JSON.parse(bytes) };
    });
  const contracts = [],
    used = new Map(),
    sourceManifest = [];
  for (const source of sourceNames) {
    const content = fs.readFileSync(path.join(root, source), 'utf8');
    // Source existence, not extant artifacts, determines the required inventory.
    const candidates = builds.filter(
      ({ build }) =>
        build.input?.sources?.[source]?.content === content &&
        Array.isArray(build.output?.sources?.[source]?.ast?.nodes)
    );
    if (!candidates.length)
      throw Error(`Missing/stale compiler source output: ${source}`);
    const definitions = candidates[0].build.output.sources[
      source
    ].ast.nodes.filter((n) => n.nodeType === 'ContractDefinition');
    const fingerprints = candidates.map(({ build }) =>
      JSON.stringify(
        build.output.sources[source].ast.nodes
          .filter((n) => n.nodeType === 'ContractDefinition')
          .map((n) => [n.name, n.contractKind, n.abstract])
      )
    );
    if (new Set(fingerprints).size !== 1)
      throw Error(`Conflicting compiler source AST: ${source}`);
    sourceManifest.push({
      source,
      sourceSha256: hash(content),
      contracts: definitions.map((n) => `${source}:${n.name}`),
    });
    for (const node of definitions) {
      const name = node.name;
      let artifact;
      try {
        artifact = read({ name, source });
      } catch (error) {
        throw Error(
          `Incomplete development artifact ${source}:${name}: ${error.message}`
        );
      }
      const artifactPath = path.join(root, 'artifacts', source, `${name}.json`);
      const debug = JSON.parse(
        fs.readFileSync(artifactPath.replace(/\.json$/, '.dbg.json'))
      );
      const buildPath = path.resolve(
        path.dirname(artifactPath),
        debug.buildInfo
      );
      const found = builds.find((item) => item.file === buildPath);
      if (!found) throw Error(`Missing compiler evidence: ${source}:${name}`);
      const compiled = found.build.output.contracts[source][name];
      const links = [
        ...new Set(
          [
            compiled.evm.bytecode.linkReferences,
            compiled.evm.deployedBytecode.linkReferences,
          ].flatMap((ref) =>
            Object.entries(ref || {}).flatMap(([file, names]) =>
              Object.keys(names).map((n) => `${file}:${n}`)
            )
          )
        ),
      ].sort();
      const externallyLinked = builds.some(({ build }) =>
        Object.values(build.output.contracts || {}).some((cs) =>
          Object.values(cs).some(
            (c) =>
              c.evm?.bytecode?.linkReferences?.[source]?.[name]?.length ||
              c.evm?.deployedBytecode?.linkReferences?.[source]?.[name]?.length
          )
        )
      );
      const kind = classification(source, node, externallyLinked);
      const size = inspectContract(artifact);
      const production = [
        'core',
        'optional-deployable',
        'externally-linked-library',
      ].includes(kind);
      contracts.push({
        ...size,
        fullyQualified: `${source}:${name}`,
        classification: kind,
        production,
        sizeExcludedReason: production
          ? null
          : `${kind}: reported but outside production size gate`,
        artifactSha256: hash(fs.readFileSync(artifactPath)),
        buildSha256: hash(found.bytes),
        sourceSha256: hash(content),
        externalLibraries: links,
      });
      used.set(buildPath, found.build);
    }
  }
  const byName = new Map(contracts.map((row) => [row.fullyQualified, row]));
  for (const row of contracts)
    for (const library of row.externalLibraries) {
      if (library.startsWith('contracts/') && !byName.has(library))
        throw Error(`Missing linked library artifact: ${library}`);
      // Upstream links also require artifacts, compiler input and current sources.
      if (!byName.has(library)) {
        const cut = library.lastIndexOf(':'),
          source = library.slice(0, cut),
          name = library.slice(cut + 1);
        const artifact = read({ source, name });
        const file = path.join(root, 'artifacts', source, `${name}.json`);
        const debug = JSON.parse(
          fs.readFileSync(file.replace(/\.json$/, '.dbg.json'))
        );
        const buildPath = path.resolve(path.dirname(file), debug.buildInfo),
          found = builds.find((item) => item.file === buildPath);
        if (!found)
          throw Error(`Missing upstream library compiler output: ${library}`);
        const compiled = found.build.output.contracts[source][name];
        const dependencies = [
          ...new Set(
            [
              compiled.evm.bytecode.linkReferences,
              compiled.evm.deployedBytecode.linkReferences,
            ].flatMap((ref) =>
              Object.entries(ref || {}).flatMap(([file, names]) =>
                Object.keys(names).map((n) => `${file}:${n}`)
              )
            )
          ),
        ].sort();
        const external = {
          ...inspectContract(artifact),
          fullyQualified: library,
          classification: 'externally-linked-library',
          production: true,
          sizeExcludedReason: null,
          artifactSha256: hash(fs.readFileSync(file)),
          buildSha256: hash(found.bytes),
          sourceSha256: hash(found.build.input.sources[source].content),
          externalLibraries: dependencies,
        };
        contracts.push(external);
        byName.set(library, external);
        used.set(buildPath, found.build);
      }
    }
  const results = [...used].map(([file, build]) => {
    (options.diagnostic ? checkDiagnosticCompiler : checkCompiler)(build);
    return {
      buildInfo: path.relative(root, file),
      compiler: build.solcLongVersion,
      compilerProvenance: build.compilerProvenance || null,
      reviewedUpstreamWarnings: checkDiagnostics(build),
    };
  });
  return {
    schema: 'agijobsv0/development-inventory/1',
    diagnostic: !!options.diagnostic,
    canonicalCompilerQualified: !options.diagnostic,
    sources: sourceManifest,
    contracts: contracts.sort((a, b) =>
      a.fullyQualified.localeCompare(b.fullyQualified)
    ),
    builds: results,
    sizeGatePassed: contracts.every((c) => !c.production || c.deployableSize),
    exclusions: [
      'test/mock, abstract/interface, inline-library and legacy/demo are compiled and source-checked; only their production size gate is excluded',
    ],
  };
}
if (require.main === module) {
  try {
    console.log(
      JSON.stringify(
        inspectSources(
          process.argv.filter((a) => a !== '--diagnostic')[2] || process.cwd(),
          { diagnostic: process.argv.includes('--diagnostic') }
        ),
        null,
        2
      )
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { inspectSources, classification, sourcesUnder };
