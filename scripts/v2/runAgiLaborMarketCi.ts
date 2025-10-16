#!/usr/bin/env ts-node

import { resolve } from 'node:path';

import { runAgiLaborMarketDemo } from './lib/agiLaborMarketExport';

async function main(): Promise<void> {
  const outputPath = resolve(
    'demo/agi-labor-market-grand-demo/ui/export/latest.json'
  );
  const payload = await runAgiLaborMarketDemo(outputPath, { silent: true });
  console.log(
    `✅ Grand demo executed for CI → ${payload.scenarios.length} scenarios, ${payload.market.mintedCertificates.length} certificates`
  );
}

main().catch((error) => {
  console.error('❌ Grand demo CI run failed:', error);
  process.exit(1);
});
