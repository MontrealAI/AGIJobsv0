#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getArg(flag, defaultValue) {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return defaultValue;
}

function canonicalise(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalise);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalise(value[key]);
    }
    return sorted;
  }
  return value;
}

function hashFor(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalise(value))).digest('hex');
}

function loadAbiDirectory(dir) {
  const result = new Map();
  if (!dir || !fs.existsSync(dir)) {
    return result;
  }
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const relative = path.relative(dir, entryPath).replace(/\\/g, '/');
        try {
          const parsed = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
          result.set(relative, {
            contractName: parsed.contractName,
            sourceName: parsed.sourceName,
            abi: parsed.abi ?? parsed,
            hash: hashFor(parsed.abi ?? parsed),
          });
        } catch (error) {
          console.warn(`Unable to parse ABI JSON: ${entryPath}`);
        }
      }
    }
  }
  return result;
}

const baseDir = getArg('--base', 'reports/abis/base');
const headDir = getArg('--head', 'reports/abis/head');
const reportPath = getArg('--report', 'reports/abis/diff.json');

const baseAbis = loadAbiDirectory(path.resolve(baseDir));
const headAbis = loadAbiDirectory(path.resolve(headDir));

const added = [];
const removed = [];
const changed = [];

const seen = new Set([...baseAbis.keys(), ...headAbis.keys()]);
for (const file of seen) {
  const baseEntry = baseAbis.get(file);
  const headEntry = headAbis.get(file);
  if (!baseEntry && headEntry) {
    added.push({ file, hash: headEntry.hash, contractName: headEntry.contractName });
  } else if (baseEntry && !headEntry) {
    removed.push({ file, hash: baseEntry.hash, contractName: baseEntry.contractName });
  } else if (baseEntry && headEntry && baseEntry.hash !== headEntry.hash) {
    changed.push({
      file,
      contractName: headEntry.contractName || baseEntry.contractName,
      baseHash: baseEntry.hash,
      headHash: headEntry.hash,
    });
  }
}

const hasDiff = added.length > 0 || removed.length > 0 || changed.length > 0;

const report = {
  generatedAt: new Date().toISOString(),
  hasDiff,
  added,
  removed,
  changed,
};

fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
fs.writeFileSync(path.resolve(reportPath), JSON.stringify(report, null, 2));

if (hasDiff) {
  console.log('ABI differences detected:');
  if (added.length) {
    console.log(`  Added (${added.length}):`);
    for (const entry of added) {
      console.log(`    + ${entry.file}`);
    }
  }
  if (removed.length) {
    console.log(`  Removed (${removed.length}):`);
    for (const entry of removed) {
      console.log(`    - ${entry.file}`);
    }
  }
  if (changed.length) {
    console.log(`  Changed (${changed.length}):`);
    for (const entry of changed) {
      console.log(`    * ${entry.file}`);
    }
  }
} else {
  console.log('No ABI differences detected.');
}
