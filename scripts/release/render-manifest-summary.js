#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    manifest: path.resolve(process.cwd(), 'reports/release/manifest.json'),
    out: path.resolve(process.cwd(), 'reports/release/manifest-summary.md'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if ((current === '--manifest' || current === '-m') && typeof argv[i + 1] === 'string') {
      args.manifest = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if ((current === '--out' || current === '-o') && typeof argv[i + 1] === 'string') {
      args.out = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    }
  }

  return args;
}

function loadManifest(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Manifest not found: ${path.relative(process.cwd(), filePath)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sanitise(value) {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : '—';
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return String(value);
    }
    return '—';
  }
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      return sanitise(value.value);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'address')) {
      return sanitise(value.address);
    }
  }
  return '—';
}

function explorerLink(explorerUrl, address) {
  if (typeof explorerUrl !== 'string' || explorerUrl.trim().length === 0) {
    return null;
  }
  if (typeof address !== 'string' || address.trim().length === 0 || address === '—') {
    return null;
  }
  return `${explorerUrl.replace(/\/$/, '')}/address/${address}`;
}

function renderContractsTable(manifest) {
  const contracts = manifest.contracts && typeof manifest.contracts === 'object'
    ? Object.entries(manifest.contracts)
    : [];

  const headers = [
    '| Contract | Config address | Deployment address | Explorer | ABI SHA-256 | Bytecode SHA-256 |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  const explorerUrl = manifest.network && manifest.network.explorerUrl
    ? manifest.network.explorerUrl
    : null;

  const rows = contracts
    .sort(([aName], [bName]) => aName.localeCompare(bName))
    .map(([name, entry]) => {
      const configAddress = sanitise(entry.addresses && entry.addresses.config);
      const deploymentAddress = sanitise(entry.addresses && entry.addresses.summary);
      const abiHash = sanitise(entry.abiHash);
      const bytecodeHash = sanitise(entry.bytecodeHash);
      const link = explorerLink(explorerUrl, deploymentAddress);
      const explorerCell = link ? `[View](${link})` : '—';
      return `| ${name} | ${configAddress} | ${deploymentAddress} | ${explorerCell} | ${abiHash} | ${bytecodeHash} |`;
    });

  if (rows.length === 0) {
    rows.push('| _No contracts discovered in manifest._ | | | | | |');
  }

  return headers.concat(rows).join('\n');
}

function renderMetadata(manifest) {
  const lines = [];
  const networkName = manifest.network && typeof manifest.network.name === 'string'
    ? manifest.network.name.trim()
    : 'unspecified';

  lines.push(`# AGI Jobs deployment summary — ${networkName || 'unspecified'}`);
  lines.push('');

  const metadata = [];
  if (manifest.git && manifest.git.commit) {
    metadata.push(`- **Git commit:** \`${manifest.git.commit}\``);
  }
  if (manifest.git && manifest.git.tag) {
    metadata.push(`- **Git tag:** \`${manifest.git.tag}\``);
  }
  if (manifest.generatedAt) {
    metadata.push(`- **Manifest generated:** ${manifest.generatedAt}`);
  }
  if (manifest.network && typeof manifest.network.chainId === 'number') {
    metadata.push(`- **Chain ID:** \`${manifest.network.chainId}\``);
  }
  if (manifest.network && typeof manifest.network.explorerUrl === 'string') {
    metadata.push(`- **Explorer:** ${manifest.network.explorerUrl}`);
  }
  if (manifest.sources && manifest.sources.deploymentConfig) {
    metadata.push(`- **Deployment config:** \`${manifest.sources.deploymentConfig}\``);
  }

  if (metadata.length > 0) {
    lines.push(...metadata);
    lines.push('');
  }

  lines.push('## Contract map');
  lines.push(renderContractsTable(manifest));
  lines.push('');

  lines.push('## Toolchain fingerprint');
  const toolchain = manifest.toolchain && typeof manifest.toolchain === 'object'
    ? manifest.toolchain
    : {};

  const toolchainLines = [];
  if (toolchain.node) {
    toolchainLines.push(`- Node.js: \`${toolchain.node}\``);
  }
  if (toolchain.npm) {
    toolchainLines.push(`- npm: \`${toolchain.npm}\``);
  }
  if (toolchain.hardhat) {
    toolchainLines.push(`- Hardhat: \`${toolchain.hardhat}\``);
  }
  if (toolchain.hardhatToolbox) {
    toolchainLines.push(`- @nomicfoundation/hardhat-toolbox: \`${toolchain.hardhatToolbox}\``);
  }
  if (toolchain.forge) {
    toolchainLines.push(`- forge: \`${toolchain.forge}\``);
  }
  if (toolchain.solc) {
    toolchainLines.push(`- solc: \`${toolchain.solc}\``);
  }
  if (Array.isArray(toolchain.solidityCompilers) && toolchain.solidityCompilers.length > 0) {
    toolchainLines.push('- Solidity compiler matrix:');
    for (const compiler of toolchain.solidityCompilers) {
      if (!compiler || typeof compiler !== 'object') {
        continue;
      }
      const descriptor = [];
      if (compiler.longVersion && compiler.longVersion !== compiler.version) {
        descriptor.push(`long ${compiler.longVersion}`);
      }
      if (compiler.optimizer && typeof compiler.optimizer === 'object') {
        const enabled = compiler.optimizer.enabled === undefined
          ? 'unspecified'
          : compiler.optimizer.enabled
            ? 'enabled'
            : 'disabled';
        if (Number.isFinite(compiler.optimizer.runs)) {
          descriptor.push(`optimizer ${enabled} (runs ${compiler.optimizer.runs})`);
        } else {
          descriptor.push(`optimizer ${enabled}`);
        }
      }
      if (Object.prototype.hasOwnProperty.call(compiler, 'viaIR')) {
        descriptor.push(`viaIR ${compiler.viaIR ? 'enabled' : 'disabled'}`);
      }
      if (compiler.evmVersion) {
        descriptor.push(`evm ${compiler.evmVersion}`);
      }
      if (Array.isArray(compiler.sources) && compiler.sources.length > 0) {
        descriptor.push(`sources: ${compiler.sources.join(', ')}`);
      }
      const suffix = descriptor.length > 0 ? ` (${descriptor.join('; ')})` : '';
      toolchainLines.push(`  - ${compiler.version}${suffix}`);
    }
  }

  if (toolchainLines.length > 0) {
    lines.push(...toolchainLines);
  } else {
    lines.push('_Toolchain metadata unavailable in manifest._');
  }
  lines.push('');

  lines.push('## Verification checklist');
  lines.push('- Confirm each explorer link resolves to a verified contract.');
  lines.push('- Cross-check ABI and bytecode SHA-256 values against `reports/release/manifest.json`.');
  lines.push('- Store this summary with the signed release bundle for audit trails.');
  lines.push('');

  return lines.join('\n');
}

function main() {
  try {
    const { manifest, out } = parseArgs(process.argv.slice(2));
    const manifestData = loadManifest(manifest);
    const markdown = renderMetadata(manifestData);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${markdown}\n`);
    console.log(`Manifest summary written to ${path.relative(process.cwd(), out)}`);
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

main();
