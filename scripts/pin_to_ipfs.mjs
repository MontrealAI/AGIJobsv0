#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  createIpfsUploader,
  resolveArweaveConfig,
  resolveProvidersFromEnv
} from '../storage/ipfs/index.js';

async function main() {
  const [, , filePath] = process.argv;
  if (!filePath) {
    console.error('Usage: node scripts/pin_to_ipfs.mjs <file>');
    process.exit(1);
  }
  const absolute = path.resolve(filePath);
  const payload = await fs.readFile(absolute);
  const providers = resolveProvidersFromEnv(process.env);
  const uploader = createIpfsUploader({
    providers,
    filename: path.basename(absolute),
    mirrorToArweave: /^true$/i.test(process.env.ANALYTICS_MIRROR_ARWEAVE ?? ''),
    arweave: resolveArweaveConfig(process.env) ?? undefined
  });
  const result = await uploader.pin(payload);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
