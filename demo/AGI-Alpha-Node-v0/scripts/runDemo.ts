import { AlphaNode } from '../src/node';
import { defaultOpportunities } from '../src/utils/opportunities';

async function main(): Promise<void> {
  const configPath = (process.argv[2] as string) ?? 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json';
  const privateKey = process.env.ALPHA_NODE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Set ALPHA_NODE_PRIVATE_KEY before running the demo script.');
  }
  const node = await AlphaNode.fromConfig(configPath, privateKey);
  const identity = await node.verifyIdentity();
  console.log('Identity verification:', identity);
  const stake = await node.stake({ dryRun: true });
  console.log('Stake check (dry run):', stake);
  const heartbeat = await node.heartbeat(defaultOpportunities());
  console.log('Heartbeat summary:', heartbeat);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
