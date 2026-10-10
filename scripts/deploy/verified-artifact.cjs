'use strict';
const fs = require('node:fs');
const path = require('node:path');

function verifyCompiledArtifact(artifact, build, readSource) {
  const settings = build?.input?.settings;
  if (
    build?.solcVersion !== '0.8.25' ||
    settings?.viaIR !== true ||
    settings?.optimizer?.enabled !== true ||
    settings?.optimizer?.runs !== 200 ||
    settings?.evmVersion !== 'cancun'
  )
    throw new Error(
      'Production artifacts require Solidity 0.8.25, viaIR, 200 optimizer runs and Cancun. Recompile without fast/coverage overrides.'
    );
  const compiled =
    build.output?.contracts?.[artifact.sourceName]?.[artifact.contractName];
  if (
    !compiled ||
    `0x${compiled.evm?.bytecode?.object}` !== artifact.bytecode ||
    `0x${compiled.evm?.deployedBytecode?.object}` !==
      artifact.deployedBytecode ||
    JSON.stringify(compiled.abi) !== JSON.stringify(artifact.abi)
  )
    throw new Error(
      'Artifact does not match its compiler output. Recompile this release.'
    );
  const pending = [artifact.sourceName];
  const visited = new Set();
  while (pending.length) {
    const name = pending.pop();
    if (visited.has(name)) continue;
    visited.add(name);
    const source = build.input.sources[name];
    const nodes = build.output.sources?.[name]?.ast?.nodes;
    if (!source || !Array.isArray(nodes))
      throw new Error(
        'Compiler source dependency evidence is missing. Recompile this release.'
      );
    if (readSource(name) !== source.content)
      throw new Error(
        `Compiled source is stale: ${name}. Recompile this release.`
      );
    for (const node of nodes)
      if (node.nodeType === 'ImportDirective') pending.push(node.absolutePath);
  }
  return artifact;
}

function createVerifiedArtifactReader(root = process.cwd()) {
  const builds = new Map();
  const artifacts = path.join(root, 'artifacts');
  const buildRoot = path.join(artifacts, 'build-info') + path.sep;
  return ({ name, source }) => {
    const file = path.join(artifacts, source, `${name}.json`);
    const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
    const debug = JSON.parse(
      fs.readFileSync(file.replace(/\.json$/, '.dbg.json'), 'utf8')
    );
    const buildFile = path.resolve(path.dirname(file), debug.buildInfo);
    if (!buildFile.startsWith(buildRoot))
      throw new Error('Invalid compiler evidence path');
    let build = builds.get(buildFile);
    if (!build) {
      build = JSON.parse(fs.readFileSync(buildFile, 'utf8'));
      builds.set(buildFile, build);
    }
    return verifyCompiledArtifact(artifact, build, (name) => {
      const sourcePath = path.resolve(
        root,
        name.startsWith('@') ? `node_modules/${name}` : name
      );
      if (!sourcePath.startsWith(path.resolve(root) + path.sep))
        throw new Error('Invalid compiler source path');
      return fs.readFileSync(sourcePath, 'utf8');
    });
  };
}
module.exports = { verifyCompiledArtifact, createVerifiedArtifactReader };
