#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const artifactPath = path.join(root, 'artifacts/contracts/AGIJobManager.sol/AGIJobManager.json');
if (!fs.existsSync(artifactPath)) {
  console.error('Artifact missing. Run `npx hardhat compile` first.');
  process.exit(1);
}
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const runtimeBytes = (artifact.deployedBytecode.length - 2) / 2;
const initBytes = (artifact.bytecode.length - 2) / 2;

const EIP170_RUNTIME_LIMIT = 24576;
const EIP3860_INIT_LIMIT = 49152;

if (runtimeBytes > EIP170_RUNTIME_LIMIT) {
  console.error(`AGIJobManager runtime too large: ${runtimeBytes} > ${EIP170_RUNTIME_LIMIT}`);
  process.exit(1);
}
if (initBytes > EIP3860_INIT_LIMIT) {
  console.error(`AGIJobManager initcode too large: ${initBytes} > ${EIP3860_INIT_LIMIT}`);
  process.exit(1);
}

console.log(JSON.stringify({ runtimeBytes, initBytes, runtimeHeadroom: EIP170_RUNTIME_LIMIT - runtimeBytes, initHeadroom: EIP3860_INIT_LIMIT - initBytes }, null, 2));
