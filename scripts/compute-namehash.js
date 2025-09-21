#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const namehash = require('eth-ens-namehash');

const TARGET_KEYS = new Set(['agentRoot', 'clubRoot', 'alphaClubRoot']);

function usage() {
  console.error('Usage: node scripts/compute-namehash.js <config.json>');
}

function loadConfig(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    throw new Error(`Failed to read configuration from ${filePath}: ${err.message}`);
  }
}

function writeConfig(filePath, config) {
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function normalizeName(rawName, label) {
  if (!rawName || typeof rawName !== 'string') {
    throw new Error(`Missing ENS name for ${label}`);
  }
  const trimmed = rawName.trim();
  if (!trimmed) {
    throw new Error(`ENS name for ${label} is empty`);
  }
  return namehash.normalize(trimmed);
}

function assignHash(entry, hash) {
  let updated = false;
  const targets = ['hash', 'node', 'value'];
  let hasTargetField = false;

  for (const field of targets) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) {
      hasTargetField = true;
      if (entry[field] !== hash) {
        entry[field] = hash;
        updated = true;
      }
    }
  }

  if (!hasTargetField) {
    entry.hash = hash;
    updated = true;
  }

  return updated;
}

function updateEntry(parent, key, value, pathLabel) {
  if (value === null || value === undefined) {
    console.warn(`Skipping ${pathLabel}: entry is undefined`);
    return false;
  }

  if (typeof value === 'string') {
    try {
      const normalizedName = normalizeName(value, pathLabel);
      const hash = namehash.hash(normalizedName);
      parent[key] = { name: normalizedName, hash };
      console.log(`Updated ${pathLabel}: ${hash}`);
      return true;
    } catch (err) {
      console.warn(`Skipping ${pathLabel}: ${err.message}`);
      return false;
    }
  }

  if (typeof value !== 'object') {
    console.warn(`Skipping ${pathLabel}: expected object or string`);
    return false;
  }

  const rawName =
    value.name ?? value.domain ?? value.ens ?? value.ensName ?? value.label ?? value.title;

  let normalizedName;
  try {
    normalizedName = normalizeName(rawName, pathLabel);
  } catch (err) {
    console.warn(`Skipping ${pathLabel}: ${err.message}`);
    return false;
  }

  const hash = namehash.hash(normalizedName);

  let changed = false;

  if (value.name !== normalizedName) {
    value.name = normalizedName;
    changed = true;
  }

  if (assignHash(value, hash)) {
    changed = true;
  }

  if (changed) {
    console.log(`Updated ${pathLabel}: ${hash}`);
  }

  return changed;
}

function traverse(value, parent, key, pathSegments, updates) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      traverse(item, value, index, [...pathSegments, index], updates)
    );
    return;
  }

  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      const currentPath = [...pathSegments, childKey];
      const label = currentPath.join('.');
      if (TARGET_KEYS.has(childKey)) {
        const changed = updateEntry(value, childKey, childValue, label);
        if (changed) {
          updates.count += 1;
        }
      }
      traverse(childValue, value, childKey, currentPath, updates);
    }
  }
}

function main() {
  const configArg = process.argv[2];

  if (!configArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const resolvedPath = path.resolve(process.cwd(), configArg);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Configuration file not found: ${resolvedPath}`);
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(resolvedPath);
  const updates = { count: 0 };

  traverse(config, null, null, [], updates);

  if (updates.count === 0) {
    console.warn('No ENS root entries were updated.');
  }

  writeConfig(resolvedPath, config);
}

main();
