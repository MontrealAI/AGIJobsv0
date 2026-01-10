import { promises as fs } from 'fs';
import { network } from 'hardhat';
import { resolveDemoAddressBookOutputPath } from './lib/demoAddressBook';
import { bootstrapHardhatDemoConfig } from './lib/hardhatDemoBootstrap';

const LOCAL_NETWORKS = new Set(['hardhat', 'localhost']);

async function main(): Promise<void> {
  if (!LOCAL_NETWORKS.has(network.name)) {
    throw new Error(
      `Demo owner matrix config can only run on local networks (hardhat/localhost). Current: ${network.name}`
    );
  }

  await bootstrapHardhatDemoConfig(network.name, undefined, { force: true });
  const outputPath = resolveDemoAddressBookOutputPath();
  const raw = await fs.readFile(outputPath, 'utf8');
  const payload = JSON.parse(raw) as Record<string, unknown>;
  console.log(`Demo owner matrix address book written to ${outputPath}`);
  console.table(payload);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('demoHardhatOwnerMatrixConfig failed:', error);
    process.exitCode = 1;
  });
}
