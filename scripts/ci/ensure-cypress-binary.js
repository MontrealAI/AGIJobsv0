#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const cypressPkgPath = path.join(repoRoot, 'node_modules', 'cypress', 'package.json');

if (!fs.existsSync(cypressPkgPath)) {
  console.error('Cypress is not installed in node_modules; run `npm install` first.');
  process.exit(1);
}

const cypressVersion = require(cypressPkgPath).version;
const expectedBinary = path.join(os.homedir(), '.cache', 'Cypress', cypressVersion, 'Cypress', 'Cypress');

if (fs.existsSync(expectedBinary)) {
  console.log(`Cypress binary already present for version ${cypressVersion}.`);
  process.exit(0);
}

console.log(`Cypress binary missing for version ${cypressVersion}; installing...`);
const install = spawnSync('npx', ['cypress', 'install', '--force'], {
  stdio: 'inherit',
  cwd: repoRoot,
});

if (install.status !== 0) {
  console.error('Cypress binary installation failed.');
  process.exit(install.status ?? 1);
}

console.log('Cypress binary installation completed.');
