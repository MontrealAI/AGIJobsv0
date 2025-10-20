#!/usr/bin/env ts-node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateTranscript } from './lib/nationalSupplyChainTranscript';

function main(): void {
  const exportPath = resolve(
    process.cwd(),
    process.env.AGI_JOBS_DEMO_EXPORT ?? 'demo/National-Supply-Chain-v0/ui/export/latest.json'
  );

  const raw = readFileSync(exportPath, 'utf8');
  const json = JSON.parse(raw);
  const summary = validateTranscript(json);

  const reportLines = [
    `📊 Timeline entries: ${summary.timelineLength}`,
    `🛡️  Owner actions recorded: ${summary.ownerActions}`,
    `🛰️  Scenarios covered: ${summary.scenarioCount}`,
    `🏅 Minted certificates: ${summary.mintedCertificates}`,
    `🚀 Unstoppable score: ${summary.unstoppableScore}`,
  ];

  console.log('✅ National supply chain transcript validated. Key metrics:');
  for (const line of reportLines) {
    console.log(`   • ${line}`);
  }
}

try {
  main();
} catch (error) {
  console.error('❌ Transcript validation failed.');
  if (error instanceof Error) {
    console.error(`   → ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
