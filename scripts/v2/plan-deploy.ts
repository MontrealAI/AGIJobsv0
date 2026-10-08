import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ethers } from 'ethers';
import { loadTokenConfig } from '../config';
const {
  buildDeploymentCandidate,
  CHAIN_IDS,
} = require('./lib/deployment-candidate.cjs');

async function main() {
  const argv = process.argv.slice(2);
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === '--offline' || key === '--help') args[key] = true;
    else if (
      ['--network', '--config', '--out'].includes(key) &&
      argv[index + 1] &&
      !argv[index + 1].startsWith('--')
    )
      args[key] = argv[++index];
    else throw new Error(`Unknown or incomplete option: ${key}`);
  }
  if (args['--help']) {
    console.log(
      'Read-only deployment candidate (never signs or deploys).\nUsage: npx ts-node scripts/v2/plan-deploy.ts --network mainnet|sepolia [--config deployment-config/<network>.json] [--out plan.json] [--offline]\nSet MAINNET_RPC_URL or SEPOLIA_RPC_URL for chain checks. Exit 2 means the report contains blocking preflight findings.'
    );
    return;
  }
  const network = args['--network'] as string;
  if (!Object.prototype.hasOwnProperty.call(CHAIN_IDS, network))
    throw new Error('--network must be mainnet or sepolia');
  const configPath = path.resolve(
    (args['--config'] as string) || `deployment-config/${network}.json`
  );
  const configBytes = fs.readFileSync(configPath, 'utf8');
  const token = loadTokenConfig({ network }).config;
  const rpc =
    process.env[network === 'mainnet' ? 'MAINNET_RPC_URL' : 'SEPOLIA_RPC_URL'];
  let provider: ethers.JsonRpcProvider | undefined;
  if (!args['--offline'] && rpc) {
    const endpoint = new URL(rpc);
    if (!['https:', 'http:'].includes(endpoint.protocol))
      throw new Error('RPC must use HTTPS or HTTP');
    const request = new ethers.FetchRequest(rpc);
    request.timeout = 15000;
    provider = new ethers.JsonRpcProvider(request, undefined, {
      batchMaxCount: 1,
    });
  }
  let revision: string | null = null;
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {}
  try {
    const report = await buildDeploymentCandidate({
      network,
      config: JSON.parse(configBytes),
      configBytes,
      token,
      provider,
      revision,
      readArtifact: ({ name, source }: { name: string; source: string }) =>
        JSON.parse(
          fs.readFileSync(
            path.join('artifacts', source, `${name}.json`),
            'utf8'
          )
        ),
    });
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (args['--out']) {
      const destination = path.resolve(args['--out'] as string);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, json, { flag: 'wx', mode: 0o600 });
      console.error(
        `Deployment candidate: ${report.status}. Report saved to ${destination}`
      );
    } else process.stdout.write(json);
    if (report.blockers.length) process.exitCode = 2;
  } finally {
    provider?.destroy();
  }
}
main().catch(() => {
  // Do not echo potentially secret-bearing RPC URLs or raw provider errors.
  console.error(
    'Deployment candidate could not be produced. Check the CLI options, readable JSON config, compiled artifacts and unused output path. Use --help for usage.'
  );
  process.exitCode = 1;
});
