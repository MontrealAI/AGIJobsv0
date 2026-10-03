#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const RUNTIME_LIMIT = 24576;
const INITCODE_LIMIT = 49152;
const REQUIRED = [
  'JobRegistry',
  'StakeManager',
  'ValidationModule',
  'Deployer',
];

function byteLength(code, label) {
  if (
    typeof code !== 'string' ||
    !/^0x(?:[a-fA-F0-9]{2})*$/.test(
      code.replace(/__\$[a-fA-F0-9]{34}\$__/g, '0'.repeat(40))
    )
  )
    throw new Error(
      `${label}: missing or malformed bytecode; run npm run compile.`
    );
  return (code.length - 2) / 2;
}

function inspectContract(artifact) {
  const runtimeBytes = byteLength(
    artifact.deployedBytecode,
    artifact.contractName
  );
  const initcodeBytes = byteLength(artifact.bytecode, artifact.contractName);
  return {
    contract: artifact.contractName,
    source: artifact.sourceName,
    runtimeBytes,
    initcodeBytes,
    deployableSize:
      runtimeBytes <= RUNTIME_LIMIT && initcodeBytes <= INITCODE_LIMIT,
  };
}

function checkArtifacts(artifactsRoot) {
  const root = path.join(artifactsRoot, 'contracts/v2');
  for (const name of REQUIRED) {
    const requiredPath = path.join(root, `${name}.sol`, `${name}.json`);
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Missing ${name} artifact; run npm run compile first.`);
    }
    const required = inspectContract(
      JSON.parse(fs.readFileSync(requiredPath, 'utf8'))
    );
    if (
      required.contract !== name ||
      !required.runtimeBytes ||
      !required.initcodeBytes
    ) {
      throw new Error(
        `Invalid or empty ${name} artifact; run npm run compile first.`
      );
    }
  }
  const rows = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'mocks') continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (
        entry.name.endsWith('.json') &&
        !entry.name.endsWith('.dbg.json')
      ) {
        const row = inspectContract(JSON.parse(fs.readFileSync(file, 'utf8')));
        if (row.runtimeBytes || row.initcodeBytes) rows.push(row);
      }
    }
  }
  walk(root);
  rows.sort((a, b) => a.contract.localeCompare(b.contract));
  return {
    runtimeLimitBytes: RUNTIME_LIMIT,
    initcodeLimitBytes: INITCODE_LIMIT,
    sizeGatePassed: rows.every((row) => row.deployableSize),
    contracts: rows,
  };
}

if (require.main === module) {
  try {
    const report = checkArtifacts(path.resolve(__dirname, '../../artifacts'));
    if (process.argv.includes('--json'))
      console.log(JSON.stringify(report, null, 2));
    else {
      console.table(report.contracts.filter((row) => !row.deployableSize));
      console.log(
        report.sizeGatePassed
          ? 'Contract bytecode fits EIP-170 / EIP-3860 limits. Constructor arguments and deployment still require validation.'
          : 'BLOCKED: production contracts exceed EIP-170 / EIP-3860 limits. Local unlimited-size tests do not prove deployability.'
      );
    }
    if (!report.sizeGatePassed) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  byteLength,
  inspectContract,
  checkArtifacts,
  RUNTIME_LIMIT,
  INITCODE_LIMIT,
};
