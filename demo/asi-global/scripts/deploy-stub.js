#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const network = process.env.NETWORK || 'localhost';
const scope = process.env.AURORA_REPORT_SCOPE || 'asi-global';
const outputPath = process.env.AURORA_DEPLOY_OUTPUT ||
  path.join('reports', network, scope, 'receipts', 'deploy.json');

const payload = {
  network,
  scope,
  generatedAt: new Date().toISOString(),
  contracts: {},
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
console.log(`Wrote stub deployment receipt to ${outputPath}`);
