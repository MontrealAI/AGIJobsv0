'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ethers } = require('ethers');
const { verifyCompiledArtifact } = require('./verified-artifact.cjs');
const { inventory } = require('../v2/lib/deployment-candidate.cjs');
const modules = require('../../config/implementation-modules.json');
const compilerBuilds = new Map();
const immutableVariables = new Map();
const compilerIdentities = new Map();

// Compare every runtime byte, including metadata and every immutable value.
// Unknown immutables or linked libraries require an explicit reviewed extension.
function createAuthoritySourceReader(root = process.cwd()) {
  // Compiler inputs are large. Share the immutable parsed build within this
  // process; current source text and artifact output are still checked below.
  const builds = compilerBuilds;
  const variableMaps = immutableVariables;
  return (name, address, { token, implementations = {} } = {}) => {
    const target = inventory().find((item) => item.name === name);
    if (!target) throw new Error(`Unknown authority source: ${name}`);
    const file = path.join(root, 'artifacts', target.source, `${name}.json`);
    const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (artifact.contractName !== name || artifact.sourceName !== target.source)
      throw new Error(`Authority artifact identity mismatch: ${name}`);
    const debug = JSON.parse(
      fs.readFileSync(file.replace(/\.json$/, '.dbg.json'), 'utf8')
    );
    const buildFile = path.resolve(path.dirname(file), debug.buildInfo);
    if (
      !buildFile.startsWith(
        path.resolve(root, 'artifacts/build-info') + path.sep
      )
    )
      throw new Error('Invalid compiler evidence path');
    let build = builds.get(buildFile);
    if (!build) {
      build = JSON.parse(fs.readFileSync(buildFile, 'utf8'));
      builds.set(buildFile, build);
      compilerIdentities.set(buildFile, {
        compiler: build.solcLongVersion,
        compilerInputSha256: createHash('sha256')
          .update(JSON.stringify(build.input))
          .digest('hex'),
      });
    }
    verifyCompiledArtifact(artifact, build, (source) => {
      const file = path.resolve(
        root,
        source.startsWith('@') ? `node_modules/${source}` : source
      );
      if (!file.startsWith(path.resolve(root) + path.sep))
        throw new Error('Invalid compiler source path');
      return fs.readFileSync(file, 'utf8');
    });
    const compiled = build.output.contracts[target.source][name];
    if (
      Object.keys(artifact.linkReferences).length ||
      Object.keys(artifact.deployedLinkReferences).length
    )
      throw new Error(`Unreviewed linked-library authority source: ${name}`);
    const variables = variableMaps.get(buildFile) || new Map();
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (
        node.nodeType === 'VariableDeclaration' &&
        node.mutability === 'immutable'
      )
        variables.set(String(node.id), node.name);
      for (const value of Object.values(node))
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
    }
    if (!variableMaps.has(buildFile)) {
      Object.values(build.output.sources).forEach((source) =>
        visit(source.ast)
      );
      variableMaps.set(buildFile, variables);
    }
    const runtime = Buffer.from(artifact.deployedBytecode.slice(2), 'hex');
    for (const [id, locations] of Object.entries(
      compiled.evm.deployedBytecode.immutableReferences || {}
    )) {
      const variable = variables.get(id);
      let value;
      if (variable === '_self' && Object.values(modules).flat().includes(name))
        value = address;
      else if (variable === 'token') value = token;
      else if (modules[name]) {
        const implementation = modules[name].find(
          (item) =>
            item.toLowerCase() === `${name}${variable?.slice(1)}`.toLowerCase()
        );
        value = implementations[implementation];
      }
      if (!value || !ethers.isAddress(value))
        throw new Error(`Missing reviewed immutable ${name}.${variable || id}`);
      for (const { start, length } of locations) {
        if (length !== 32 || start < 0 || start + length > runtime.length)
          throw new Error(`Invalid immutable reference: ${name}.${variable}`);
        Buffer.from(ethers.zeroPadValue(value, length).slice(2), 'hex').copy(
          runtime,
          start
        );
      }
    }
    return {
      ...artifact,
      ...compilerIdentities.get(buildFile),
      source: `${target.source}:${name}`,
      runtime: `0x${runtime.toString('hex')}`,
    };
  };
}

async function assertChain(provider, expected) {
  const actual = BigInt(await provider.send('eth_chainId', []));
  if (actual !== BigInt(expected))
    throw new Error(
      `Authority chain mismatch: expected ${expected}, observed ${actual}`
    );
}

async function pinnedReader(provider, chainId, blockTag = 'finalized') {
  await assertChain(provider, chainId);
  const block = await provider.getBlock(blockTag);
  if (!block?.hash)
    throw new Error('Authority readback requires a canonical block');
  // Local simulators may not implement EIP-1898. Never weaken public-chain pins.
  const tag =
    BigInt(chainId) === 31337n
      ? ethers.toQuantity(block.number)
      : { blockHash: block.hash, requireCanonical: true };
  return {
    block: {
      number: block.number,
      hash: block.hash,
      timestamp: block.timestamp,
    },
    code: (address) => provider.send('eth_getCode', [address, tag]),
    async call(address, signature, args = []) {
      const abi = new ethers.Interface([`function ${signature}`]);
      const method = abi.fragments[0].name;
      const data = await provider.send('eth_call', [
        { to: address, data: abi.encodeFunctionData(method, args) },
        tag,
      ]);
      const result = abi.decodeFunctionResult(method, data);
      return result.length === 1 ? result[0] : result;
    },
    async finish() {
      await assertChain(provider, chainId);
      if ((await provider.getBlock(block.number))?.hash !== block.hash)
        throw new Error('Authority readback block is no longer canonical');
    },
  };
}

module.exports = { createAuthoritySourceReader, assertChain, pinnedReader };
