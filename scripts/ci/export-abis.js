#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function getArg(flag, defaultValue) {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return defaultValue;
}

const artifactsDir = path.resolve(getArg('--artifacts', 'artifacts/contracts'));
const outDir = path.resolve(getArg('--out', 'reports/abis'));

if (!fs.existsSync(artifactsDir)) {
  console.error(`Artifacts directory does not exist: ${artifactsDir}`);
  process.exit(1);
}

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.dbg.json')) {
      files.push(entryPath);
    }
  }
  return files;
}

const artifactFiles = walk(artifactsDir);
if (!artifactFiles.length) {
  console.warn(`No Hardhat artifact files found under ${artifactsDir}`);
}

for (const filePath of artifactFiles) {
  const relative = path.relative(artifactsDir, filePath);
  const destination = path.join(outDir, relative);
  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn(`Skipping invalid JSON artifact: ${filePath}`);
    continue;
  }

  const abi = parsed.abi ?? [];
  const contractName = parsed.contractName || path.basename(filePath, '.json');
  const sourceName = parsed.sourceName || null;
  const output = {
    contractName,
    sourceName,
    abi,
  };

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(output, null, 2));
}

console.log(`Exported ${artifactFiles.length} ABI files to ${outDir}`);
