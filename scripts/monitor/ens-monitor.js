const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = process.env.RPC_URL;
const IDENTITY_REGISTRY_ADDRESS = process.env.IDENTITY_REGISTRY_ADDRESS;

if (!RPC_URL || !IDENTITY_REGISTRY_ADDRESS) {
  console.error('RPC_URL and IDENTITY_REGISTRY_ADDRESS must be set');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const abi = [
  'event OwnershipVerified(address indexed claimant, string subdomain)',
  'event RecoveryInitiated(string reason)',
];
const registry = new ethers.Contract(IDENTITY_REGISTRY_ADDRESS, abi, provider);

const recoveryEvents = [];
const LOG_FILE = path.join(__dirname, 'ens-monitor.log');

function log(msg) {
  const entry = `${new Date().toISOString()} ${msg}`;
  console.log(entry);
  try {
    fs.appendFileSync(LOG_FILE, entry + '\n');
  } catch (err) {
    console.error('Failed to write log file', err);
  }
}

registry.on('OwnershipVerified', (claimant, subdomain) => {
  log(`OwnershipVerified: ${claimant} -> ${subdomain}`);
});

registry.on('RecoveryInitiated', (reason) => {
  const now = Date.now();
  recoveryEvents.push(now);
  while (recoveryEvents.length && now - recoveryEvents[0] > 60000) {
    recoveryEvents.shift();
  }
  log(`RecoveryInitiated: ${reason}`);
  if (recoveryEvents.length >= 5) {
    log(
      `Anomaly detected: ${recoveryEvents.length} RecoveryInitiated events in 60s`
    );
  }
});

log('ENS identity monitor started');

process.on('SIGINT', () => {
  log('Shutting down');
  registry.removeAllListeners();
  process.exit(0);
});
