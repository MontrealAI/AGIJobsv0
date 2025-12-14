#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const network = process.env.NETWORK || 'localhost';
const scope = process.env.AURORA_REPORT_SCOPE || 'asi-global';
const reportDir = path.join('reports', network, scope, 'receipts');
const missionPath = process.env.AURORA_MISSION_CONFIG ||
  path.join('demo', 'asi-global', 'config', 'mission@v2.json');
const deployOutput = process.env.AURORA_DEPLOY_OUTPUT ||
  path.join(reportDir, 'deploy.json');

fs.mkdirSync(reportDir, { recursive: true });

const timestamp = new Date().toISOString();

function writeJson(fileName, payload) {
  const target = path.isAbsolute(fileName) ? fileName : path.join(reportDir, fileName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(payload, null, 2));
}

function loadMission() {
  try {
    const raw = fs.readFileSync(missionPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return {
      scope,
      description: 'Stubbed AURORA mission; mission config missing or unreadable.',
      jobs: [],
      error: String(err),
    };
  }
}

const mission = loadMission();
writeJson('mission.json', mission);

const deployTarget = path.isAbsolute(deployOutput)
  ? deployOutput
  : path.resolve(deployOutput);
fs.mkdirSync(path.dirname(deployTarget), { recursive: true });
fs.writeFileSync(deployTarget, JSON.stringify({
  network,
  scope,
  generatedAt: timestamp,
  contracts: {},
}, null, 2));

writeJson('stake.json', { network, scope, balances: {}, generatedAt: timestamp });
writeJson('governance.json', {
  network,
  scope,
  generatedAt: timestamp,
  actions: [],
  thermostat: [],
});

const placeholderTx = '0x' + '0'.repeat(64);
writeJson('postJob.json', { txHash: placeholderTx, mission: mission.scope || scope, generatedAt: timestamp });
writeJson('submit.json', { txHash: placeholderTx, resultURI: null, generatedAt: timestamp });
writeJson('validate.json', { txHash: placeholderTx, commits: 0, reveals: 0, generatedAt: timestamp });
writeJson('finalize.json', { txHash: placeholderTx, payouts: {}, generatedAt: timestamp });

console.log(`Stubbed AURORA demo receipts written to ${reportDir}`);
