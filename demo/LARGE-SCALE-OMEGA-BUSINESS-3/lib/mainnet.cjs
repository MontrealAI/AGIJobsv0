'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { ROOT, sha256 } = require('./scenario.cjs');
const PLAN = `Omega mainnet preparation — no commands executed, no RPC contacted.
1. Complete ui/operator-playbook.md commissioning gates with a separate deployment signer.
2. Review deployment-config/mainnet.json and an explicit deployer config, governance,
   treasury, token economics, artifacts, gas limits and output locations. Compile and
   audit the production contracts through the repository release workflow.
   This route requires governance to match the MAINNET_PRIVATE_KEY signer; a multisig
   or timelock needs a separately reviewed deployment/ownership-transfer procedure.
3. Run npm run deploy:checklist using the reviewed MAINNET_RPC_URL environment.
4. The optional --execute route checks eth_chainId = 1, binds a protected snapshot to the exact config hash,
   then opens the existing interactive deploy:oneclick:wizard without --yes or Compose.
   The wizard updates its explicit env file AFTER deployment, from actual addresses.
5. Review the generated owner change ticket, deployment receipts and control ownership.

Optional execution (real transactions; operator terminal and reviewed files required):
  --execute --config /absolute/deployer.json --config-sha256 <64 hex>
  --env /absolute/operator.env --ticket /absolute/new-change-ticket.md
No sample config, wallet, secret, ENS registration or IPFS publication is supplied.
The offline rehearsal is not a production deployment approval.`;
function canonicalOutput(file) {
  let ancestor = path.resolve(file);
  const suffix = [];
  while (true) {
    try {
      fs.lstatSync(ancestor);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    suffix.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('Cannot resolve output ancestor');
    ancestor = parent;
  }
  return path.join(fs.realpathSync(ancestor), ...suffix);
}
function parse(argv) {
  const o = { execute: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--execute') o.execute = true;
    else if (arg === '--help' || arg === '-h') o.help = true;
    else if (
      ['--config', '--config-sha256', '--env', '--ticket'].includes(arg) &&
      argv[i + 1] &&
      !argv[i + 1].startsWith('--')
    )
      o[arg.slice(2)] = argv[++i];
    else throw new Error(`Unknown or incomplete mainnet option ${arg}`);
  }
  if (o.execute && !o.help) {
    for (const name of ['config', 'env', 'ticket'])
      if (!o[name] || !path.isAbsolute(o[name]))
        throw new Error(`${name} must be an explicit absolute path`);
    if (!/^[a-f0-9]{64}$/.test(o['config-sha256'] || ''))
      throw new Error('A reviewed config SHA-256 is required');
    const bytes = fs.readFileSync(o.config);
    if (bytes.length > 1024 * 1024 || sha256(bytes) !== o['config-sha256'])
      throw new Error('Deployment config differs from the reviewed digest');
    const config = JSON.parse(bytes);
    if (config.network !== 'mainnet')
      throw new Error('Deployment config must explicitly select mainnet');
    for (const [label, address] of [
      ['governance', config.governance],
      ['treasury', config.econ?.treasury],
    ])
      if (
        !/^0x[0-9a-fA-F]{40}$/.test(address || '') ||
        /^0x0{40}$/i.test(address)
      )
        throw new Error(`Explicit nonzero ${label} required`);
    if (
      !config.output ||
      !path.isAbsolute(config.output) ||
      fs.existsSync(config.output)
    )
      throw new Error(
        'Config output must be a fresh absolute addressbook path'
      );
    if (fs.existsSync(o.ticket))
      throw new Error('Change-ticket output already exists');
    if (canonicalOutput(config.output) === canonicalOutput(o.ticket))
      throw new Error(
        'Change-ticket and deployment addressbook paths must be distinct'
      );
    const envStat = fs.statSync(o.env),
      configStat = fs.statSync(o.config);
    if (!envStat.isFile())
      throw new Error('An existing operator env file is required');
    if (
      canonicalOutput(o.config) === canonicalOutput(o.env) ||
      (configStat.dev === envStat.dev && configStat.ino === envStat.ino)
    )
      throw new Error(
        'Reviewed config and writable operator env must be distinct files'
      );
    o.output = config.output;
    o.governance = config.governance;
  }
  return o;
}
function assertGovernanceSigner(governance, env = process.env) {
  const value = String(env.MAINNET_PRIVATE_KEY || '')
    .trim()
    .replace(/^0x/i, '');
  if (!/^[a-f0-9]{1,64}$/i.test(value))
    throw new Error(
      'A valid MAINNET_PRIVATE_KEY deployment signer is required'
    );
  let address;
  try {
    const { Wallet } = require('ethers');
    address = new Wallet('0x' + value.padStart(64, '0')).address;
  } catch {
    throw new Error('Cannot validate MAINNET_PRIVATE_KEY deployment signer');
  }
  if (address.toLowerCase() !== governance.toLowerCase())
    throw new Error(
      'Governance must match the configured deployment signer; multisig or timelock initialization requires a separate reviewed procedure'
    );
  return address;
}
async function chainId(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error(
      'MAINNET_RPC_URL must be a credential-free HTTPS URL (provider key may be in the path)'
    );
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_chainId',
      params: [],
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('RPC chain check failed');
  let bytes = 0,
    chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 4096) throw new Error('RPC chain response too large');
    chunks.push(chunk);
  }
  const result = JSON.parse(Buffer.concat(chunks));
  if (
    result.error ||
    result.id !== 1 ||
    !/^0x[0-9a-f]+$/i.test(result.result) ||
    BigInt(result.result) !== 1n
  )
    throw new Error('RPC must report Ethereum mainnet chain ID 1');
}
function withReviewedConfig(configPath, expectedDigest, invoke) {
  const bytes = fs.readFileSync(configPath);
  if (bytes.length > 1024 * 1024 || sha256(bytes) !== expectedDigest)
    throw new Error('Config changed during preflight');
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'omega-reviewed-config-')
  );
  const snapshot = path.join(directory, 'deployer.json');
  try {
    fs.chmodSync(directory, 0o700);
    fs.writeFileSync(snapshot, bytes, { flag: 'wx', mode: 0o400 });
    fs.chmodSync(directory, 0o500);
    return invoke(snapshot);
  } finally {
    fs.chmodSync(directory, 0o700);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
function publishChangeTicket(output, invoke) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'omega-change-ticket-')
  );
  fs.chmodSync(directory, 0o700);
  const staged = path.join(directory, 'change-ticket.md');
  try {
    invoke(staged);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.copyFileSync(staged, output, fs.constants.COPYFILE_EXCL);
  } catch (error) {
    throw new Error(
      `Change-ticket publication failed; generated evidence is retained at ${staged}: ${error.message}`
    );
  }
  fs.rmSync(directory, { recursive: true, force: true });
}
async function main(argv = process.argv.slice(2)) {
  const o = parse(argv);
  if (!o.execute || o.help) {
    console.log(PLAN);
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      'Mainnet execution requires an interactive operator terminal'
    );
  if (!process.env.MAINNET_RPC_URL)
    throw new Error(
      'Set MAINNET_RPC_URL in the protected deployment environment'
    );
  assertGovernanceSigner(o.governance);
  await chainId(process.env.MAINNET_RPC_URL);
  const invoke = (args) => {
    const result = spawnSync('npm', args, {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0)
      throw new Error(
        'Deployment phase failed; reconcile receipts before any retry'
      );
  };
  invoke(['run', 'deploy:checklist']);
  withReviewedConfig(o.config, o['config-sha256'], (snapshot) =>
    invoke([
      'run',
      'deploy:oneclick:wizard',
      '--',
      '--config',
      snapshot,
      '--network',
      'mainnet',
      '--env',
      o.env,
      '--deployment-output',
      o.output,
      '--no-compose',
    ])
  );
  if (!fs.existsSync(o.output))
    throw new Error(
      'Wizard aborted or no deployment addressbook exists; no change ticket generated'
    );
  publishChangeTicket(o.ticket, (staged) =>
    invoke([
      'run',
      'owner:change-ticket',
      '--',
      '--network',
      'mainnet',
      '--format',
      'markdown',
      '--out',
      staged,
    ])
  );
}
module.exports = {
  parse,
  chainId,
  main,
  PLAN,
  withReviewedConfig,
  assertGovernanceSigner,
  publishChangeTicket,
};
if (require.main === module)
  main().catch((error) => {
    console.error(`Omega mainnet: ${error.message}`);
    process.exitCode = 1;
  });
