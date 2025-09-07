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
  'event AdditionalAgentUsed(address indexed agent, string subdomain)',
  'event AdditionalValidatorUsed(address indexed validator, string subdomain)',
];
const registry = new ethers.Contract(IDENTITY_REGISTRY_ADDRESS, abi, provider);

const recoveryEvents = [];
const additionalAgentEvents = [];
const additionalValidatorEvents = [];
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
      `ALERT: ${recoveryEvents.length} RecoveryInitiated events in 60s`
    );
  }
});

registry.on('AdditionalAgentUsed', (agent, subdomain) => {
  const now = Date.now();
  additionalAgentEvents.push(now);
  while (
    additionalAgentEvents.length &&
    now - additionalAgentEvents[0] > 60 * 60 * 1000
  ) {
    additionalAgentEvents.shift();
  }
  log(`AdditionalAgentUsed: ${agent} -> ${subdomain}`);
  if (additionalAgentEvents.length >= 10) {
    log(
      `ALERT: ${additionalAgentEvents.length} AdditionalAgentUsed events in 1h`
    );
  }
});

registry.on('AdditionalValidatorUsed', (validator, subdomain) => {
  const now = Date.now();
  additionalValidatorEvents.push(now);
  while (
    additionalValidatorEvents.length &&
    now - additionalValidatorEvents[0] > 60 * 60 * 1000
  ) {
    additionalValidatorEvents.shift();
  }
  log(`AdditionalValidatorUsed: ${validator} -> ${subdomain}`);
  if (additionalValidatorEvents.length >= 10) {
    log(
      `ALERT: ${additionalValidatorEvents.length} AdditionalValidatorUsed events in 1h`
    );
  }
});

log('ENS identity monitor started');

process.on('SIGINT', () => {
  log('Shutting down');
  registry.removeAllListeners();
  process.exit(0);
});
