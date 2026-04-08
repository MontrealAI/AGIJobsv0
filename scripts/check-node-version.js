const fs = require('fs');
const path = require('path');

function parseVersion(version) {
  const match = version.trim().match(/^(?:v)?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersions(current, required) {
  if (current.major !== required.major) {
    return current.major - required.major;
  }
  if (current.minor !== required.minor) {
    return current.minor - required.minor;
  }
  return current.patch - required.patch;
}

function readRequiredVersion() {
  const nvmrcPath = path.join(__dirname, '..', '.nvmrc');
  if (fs.existsSync(nvmrcPath)) {
    const contents = fs.readFileSync(nvmrcPath, 'utf8');
    const parsed = parseVersion(contents);
    if (parsed) {
      return parsed;
    }
  }

  const packageJson = require(path.join(__dirname, '..', 'package.json'));
  const engine = packageJson?.engines?.node;
  if (engine) {
    const engineVersion = parseVersion(engine.replace(/x$/i, '0'));
    if (engineVersion) {
      return engineVersion;
    }
  }

  return null;
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function ensureVersion() {
  const required = readRequiredVersion();
  if (!required) {
    return;
  }

  const current = parseVersion(process.version);
  if (!current) {
    return;
  }

  if (compareVersions(current, required) < 0) {
    const message = [
      'Node.js version check failed.',
      `Required: >= ${formatVersion(required)}`,
      `Current:  ${formatVersion(current)}`,
      '',
      'Use `nvm use` (or install from .nvmrc) to align with the project toolchain.',
    ].join('\n');
    console.error(message);
    process.exit(1);
  }
}

ensureVersion();
