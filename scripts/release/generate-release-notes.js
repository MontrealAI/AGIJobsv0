#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    manifest: path.resolve(process.cwd(), 'reports/release/manifest.json'),
    out: path.resolve(process.cwd(), 'reports/release/notes.md'),
    network: 'unspecified',
    version: null,
    changelog: 'CHANGELOG.md',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--manifest' && typeof argv[i + 1] === 'string') {
      args.manifest = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (current === '--out' && typeof argv[i + 1] === 'string') {
      args.out = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (current === '--network' && typeof argv[i + 1] === 'string') {
      args.network = argv[i + 1];
      i += 1;
    } else if (current === '--version' && typeof argv[i + 1] === 'string') {
      args.version = argv[i + 1];
      i += 1;
    } else if (current === '--changelog' && typeof argv[i + 1] === 'string') {
      args.changelog = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${path.relative(process.cwd(), filePath)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadChangelogSection(changelogPath, version) {
  if (!version) {
    return null;
  }
  const fullPath = path.resolve(process.cwd(), changelogPath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^##\\s+v${escapedVersion}\\b([\\s\\S]*?)(?:^##\\s+v|\n?$)`, 'm');
  const match = content.match(pattern);
  if (!match) {
    return null;
  }
  return match[1].trim();
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
    return Number.isFinite(value) ? String(value) : '—';
  }
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'address')) {
      return sanitise(value.address);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      return sanitise(value.value);
    }
  }
  return '—';
}

function buildNetworkSummary(manifestNetwork, fallbackNetwork) {
  const info = manifestNetwork && typeof manifestNetwork === 'object' ? manifestNetwork : {};
  const name = typeof info.name === 'string' && info.name.trim().length > 0
    ? info.name.trim()
    : typeof fallbackNetwork === 'string' && fallbackNetwork.trim().length > 0
      ? fallbackNetwork.trim()
      : 'unspecified';

  const extras = [];
  if (typeof info.chainId === 'number' && Number.isFinite(info.chainId) && info.chainId > 0) {
    extras.push(`chainId ${info.chainId}`);
  }
  if (typeof info.explorerUrl === 'string' && info.explorerUrl.trim().length > 0) {
    extras.push(`explorer ${info.explorerUrl.trim()}`);
  }

  const summaryLine = extras.length > 0
    ? `- **Network:** \`${name}\` (${extras.join(', ')})`
    : `- **Network:** \`${name}\``;

  const extraLines = [];
  if (typeof info.deploymentConfig === 'string' && info.deploymentConfig.trim().length > 0) {
    extraLines.push(`  - Deployment config: \`${info.deploymentConfig.trim()}\``);
  }

  return { summaryLine, extraLines };
}

function buildToolchainSection(toolchain = {}) {
  const entries = [];
  if (toolchain.node) {
    entries.push(`- Node.js: \`${toolchain.node}\``);
  }
  if (toolchain.hardhat) {
    entries.push(`- Hardhat: \`${toolchain.hardhat}\``);
  }
  if (toolchain.hardhatToolbox) {
    entries.push(`- @nomicfoundation/hardhat-toolbox: \`${toolchain.hardhatToolbox}\``);
  }
  if (toolchain.solc) {
    entries.push(`- solc: \`${toolchain.solc}\``);
  }
  if (toolchain.forge) {
    entries.push(`- forge: \`${toolchain.forge}\``);
  }
  return entries.length > 0 ? entries.join('\n') : '_Toolchain metadata unavailable._';
}

function buildContractsTable(contracts = {}) {
  const headers = [
    '| Contract | Config address | Deployment address | ABI SHA-256 | Bytecode SHA-256 | Artifact |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  const rows = Object.entries(contracts)
    .sort(([aName], [bName]) => aName.localeCompare(bName))
    .map(([name, entry]) => {
      const configAddress = sanitise(entry.addresses && entry.addresses.config);
      const deployedAddress = sanitise(entry.addresses && entry.addresses.summary);
      const abiHash = sanitise(entry.abiHash);
      const bytecodeHash = sanitise(entry.bytecodeHash);
      const artifactPath = sanitise(entry.artifact);
      return `| ${name} | ${configAddress} | ${deployedAddress} | ${abiHash} | ${bytecodeHash} | ${artifactPath} |`;
    });

  if (rows.length === 0) {
    rows.push('| _No contracts found in manifest._ | | | | | |');
  }

  return headers.concat(rows).join('\n');
}

function writeReleaseNotes({ manifestPath, outPath, network, version, changelogPath }) {
  const manifest = readJson(manifestPath);
  const resolvedVersion = version || manifest.packageVersion || 'unspecified';
  const lines = [];

  lines.push(`# AGI Jobs v${resolvedVersion} — Release Notes`);
  lines.push('');
  const networkSummary = buildNetworkSummary(manifest.network, network);
  lines.push(networkSummary.summaryLine);
  for (const extraLine of networkSummary.extraLines) {
    lines.push(extraLine);
  }
  if (manifest.git && manifest.git.commit) {
    lines.push(`- **Git commit:** \`${manifest.git.commit}\``);
  }
  if (manifest.git && manifest.git.tag) {
    lines.push(`- **Git tag:** \`${manifest.git.tag}\``);
  }
  if (manifest.generatedAt) {
    lines.push(`- **Manifest generated:** ${manifest.generatedAt}`);
  }
  lines.push('');

  lines.push('## Toolchain');
  lines.push(buildToolchainSection(manifest.toolchain));
  lines.push('');

  lines.push('## Contract inventory');
  lines.push(buildContractsTable(manifest.contracts));
  lines.push('');

  lines.push('## Release artefacts');
  lines.push('- `reports/release/manifest.json` — canonical deployment manifest.');
  lines.push('- `reports/sbom/cyclonedx.json` — CycloneDX SBOM produced during release.');
  lines.push('- `reports/abis/head` — exported ABIs aligned with the manifest addresses.');
  lines.push('- `typechain-types/` — generated TypeChain bindings for integrators.');
  lines.push('- `deployment-config/verification/` — explorer verification inputs.');
  lines.push('- `reports/release/verification-summary.json` — authoritative explorer verification log.');
  lines.push('');

  lines.push('## Explorer verification evidence');
  lines.push(
    'The release workflow executes `scripts/release/run-etherscan-verification.js` using an OIDC-sourced API key. ' +
      'Inspect `reports/release/verification-summary.json` (bundled in the artefact tarball and uploaded as a standalone release asset) for the per-contract verification status once the `Verify deployed contracts` job completes.'
  );
  lines.push('');

  const warnings = Array.isArray(manifest.warnings) ? manifest.warnings : [];
  lines.push('## Manifest warnings');
  if (warnings.length === 0) {
    lines.push('_No warnings — manifest inputs satisfied all release invariants._');
  } else {
    lines.push('Resolve the following warnings before promoting this build to production:');
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }
  lines.push('');

  const changelogSection = loadChangelogSection(changelogPath, resolvedVersion);
  if (changelogSection) {
    lines.push('## Changelog excerpt');
    lines.push(changelogSection);
    lines.push('');
  }

  lines.push('## Post-release checklist');
  lines.push('- Publish rendered Defender/Forta sentinel JSON from `monitoring/onchain/rendered/`.');
  lines.push('- Update `docs/DEPLOYED_ADDRESSES.md` with the live contract metadata.');
  lines.push('- File the incident-response tabletop summary referenced in `docs/security/incident-tabletop.md`.');
  lines.push('');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);

  console.log(`Release notes written to ${path.relative(process.cwd(), outPath)}`);
}

function main() {
  try {
    const { manifest, out, network, version, changelog } = parseArgs(process.argv.slice(2));
    writeReleaseNotes({
      manifestPath: manifest,
      outPath: out,
      network,
      version,
      changelogPath: changelog,
    });
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

main();
