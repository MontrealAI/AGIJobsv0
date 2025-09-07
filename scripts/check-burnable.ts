import { JsonRpcProvider, Interface } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
  const provider = new JsonRpcProvider(rpcUrl);

  const configPath = path.join(__dirname, '..', 'config', 'agialpha.json');
  const { address } = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    address: string;
  };

  const iface = new Interface(['function burn(uint256)']);
  const data = iface.encodeFunctionData('burn', [0n]);

  try {
    const result = await provider.call({ to: address, data });
    if (!result || result === '0x') {
      console.error('burn(0) returned no data');
      process.exit(1);
    }
    console.log('burn(0) call succeeded');
  } catch (err) {
    console.error('burn(0) call reverted:', err);
    process.exit(1);
  }
}

main();
