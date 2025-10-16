#!/usr/bin/env ts-node

import { resolve } from 'node:path';

import { validateDemoExportFile } from './lib/agiLaborMarketExport';

async function main(): Promise<void> {
  const targetArg = process.argv[2];
  const target = resolve(
    targetArg ?? 'demo/agi-labor-market-grand-demo/ui/export/latest.json'
  );
  const payload = await validateDemoExportFile(target);
  console.log(
    `✅ AGI Jobs labour market transcript valid → ${payload.scenarios.length} scenarios, ${payload.market.mintedCertificates.length} credential NFTs`
  );
}

main().catch((error) => {
  console.error('❌ Transcript validation failed:', error);
  process.exit(1);
});
