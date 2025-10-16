#!/usr/bin/env ts-node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

const DEFAULT_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '0x8b3a350cf5c34c9194ca3ffb0fb7bf3af58b9146a59147a714acac23820988e9'
];

const AGIALPHA_DECIMALS = JSON.parse(
  fs.readFileSync(path.join('config', 'agialpha.json'), 'utf8')
).decimals as number;

const jobRegistryAbi = JSON.parse(
  fs.readFileSync('scripts/v2/lib/prebuilt/JobRegistry.json', 'utf8')
).abi;
const stakeManagerAbi = JSON.parse(
  fs.readFileSync('scripts/v2/lib/prebuilt/StakeManager.json', 'utf8')
).abi;
const agialphaAbi = JSON.parse(
  fs.readFileSync('scripts/v2/lib/agialphaToken.json', 'utf8')
).abi;

const SPEC_TEMPLATE = JSON.parse(
  fs.readFileSync(
    path.join('demo', 'alpha-agi-mark', 'config', 'market.spec.template.json'),
    'utf8'
  )
);

const REPORT_ROOT = path.join('reports');

function parseNetwork(): string {
  const idx = process.argv.indexOf('--network');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  if (process.env.NETWORK) return process.env.NETWORK;
  return 'localhost';
}

function resolveDeploySummary(network: string): string {
  const candidate = process.env.DEPLOY_DEFAULTS_OUTPUT
    ? path.resolve(process.env.DEPLOY_DEFAULTS_OUTPUT)
    : path.resolve(REPORT_ROOT, network, 'agimark', 'deploy.json');
  if (!fs.existsSync(candidate)) {
    throw new Error(
      `Deployment summary not found at ${candidate}. Did you run deployDefaults.ts with DEPLOY_DEFAULTS_OUTPUT set?`
    );
  }
  return candidate;
}

function parseAddressMap(summary: any): Record<string, string> {
  if (!summary) throw new Error('Missing deployment summary JSON');
  const contracts: Record<string, any> = summary.contracts || summary;
  const pick = (key: string, fallback?: string) => {
    const raw = contracts[key] || fallback;
    if (!raw || typeof raw !== 'string') {
      throw new Error(`Required contract address ${key} missing in deploy summary`);
    }
    return ethers.getAddress(raw);
  };
  return {
    agiAlpha: pick('AGIALPHA'),
    stakeManager: pick('StakeManager'),
    jobRegistry: pick('JobRegistry'),
    validationModule: pick('ValidationModule'),
    disputeModule: pick('DisputeModule'),
    certificateNFT: pick('CertificateNFT'),
    identityRegistry: pick('IdentityRegistry', ethers.ZeroAddress),
    systemPause: pick('SystemPause', ethers.ZeroAddress),
    rewardEngine: pick('RewardEngineMB', ethers.ZeroAddress)
  };
}

function toUnits(value: string | number): bigint {
  return ethers.parseUnits(value.toString(), AGIALPHA_DECIMALS);
}

function createReportDir(network: string): string {
  const scope = path.join(REPORT_ROOT, network, 'agimark');
  fs.mkdirSync(path.join(scope, 'receipts'), { recursive: true });
  return scope;
}

async function main() {
  const network = parseNetwork();
  const rpcUrl =
    process.env.RPC_URL || (network === 'localhost' ? 'http://127.0.0.1:8545' : '');
  if (!rpcUrl) {
    throw new Error('RPC_URL must be provided for non-localhost networks');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deploySummaryPath = resolveDeploySummary(network);
  const deploySummary = JSON.parse(fs.readFileSync(deploySummaryPath, 'utf8'));
  const addresses = parseAddressMap(deploySummary);

  const owner = new ethers.Wallet(DEFAULT_KEYS[0], provider);
  const requester = new ethers.Wallet(DEFAULT_KEYS[1], provider);
  const worker = new ethers.Wallet(DEFAULT_KEYS[2], provider);
  const validators = [
    new ethers.Wallet(DEFAULT_KEYS[3], provider),
    new ethers.Wallet(DEFAULT_KEYS[4], provider),
    new ethers.Wallet(DEFAULT_KEYS[5], provider)
  ];

  const token = new ethers.Contract(addresses.agiAlpha, agialphaAbi, owner);
  const jobRegistry = new ethers.Contract(
    addresses.jobRegistry,
    jobRegistryAbi,
    requester
  );
  const stakeManager = new ethers.Contract(
    addresses.stakeManager,
    stakeManagerAbi,
    requester
  );
  const reportDir = createReportDir(network);
  const receiptsDir = path.join(reportDir, 'receipts');

  const rewardHuman = SPEC_TEMPLATE.escrow?.amountPerItem || '100';
  const reward = toUnits(rewardHuman);

  const feePct = BigInt(await jobRegistry.connect(owner).feePct());
  const fee = (reward * feePct) / 100n;
  const totalEmployerLock = reward + fee;

  const workerStakeHuman = SPEC_TEMPLATE.stake?.worker || '50';
  const validatorStakeHuman = SPEC_TEMPLATE.stake?.validator || '100';
  const workerStake = toUnits(workerStakeHuman);
  const validatorStake = toUnits(validatorStakeHuman);

  async function ensureFunds(wallet: ethers.Wallet, label: string, amount: bigint) {
    const balance: bigint = await token.connect(wallet).balanceOf(wallet.address);
    if (balance >= amount) return;
    const delta = amount - balance;
    const tx = await token.connect(owner).mint(wallet.address, delta);
    await tx.wait();
    fs.writeFileSync(
      path.join(receiptsDir, `${label}-mint.json`),
      JSON.stringify({ to: wallet.address, amount: delta.toString(), tx: tx.hash }, null, 2)
    );
  }

  await ensureFunds(requester, 'requester', totalEmployerLock);
  await ensureFunds(worker, 'worker', workerStake);
  for (let i = 0; i < validators.length; i++) {
    await ensureFunds(validators[i], `validator-${i + 1}`, validatorStake);
  }

  const stakeManagerAddress = await stakeManager.getAddress();
  const approvals: Array<{ actor: string; tx: string }> = [];

  async function approve(actor: ethers.Wallet, label: string, amount: bigint) {
    const tx = await token.connect(actor).approve(stakeManagerAddress, amount);
    await tx.wait();
    approvals.push({ actor: label, tx: tx.hash });
  }

  await approve(requester, 'requester', totalEmployerLock);
  await approve(worker, 'worker', workerStake);
  for (let i = 0; i < validators.length; i++) {
    await approve(validators[i], `validator-${i + 1}`, validatorStake);
  }

  const ackTx = await jobRegistry.connect(requester).acknowledgeTaxPolicy();
  await ackTx.wait();

  const deadline = Math.floor(Date.now() / 1000) + 6 * 3600;
  const specUri = `ipfs://alpha-agi-mark/${Date.now()}`;
  const specHash = ethers.keccak256(ethers.toUtf8Bytes(specUri));
  const specPayload = {
    ...SPEC_TEMPLATE,
    question: SPEC_TEMPLATE.question || 'Foresight mission',
    uri: specUri,
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(reportDir, 'spec.json'),
    JSON.stringify(specPayload, null, 2)
  );
  const callResult = await jobRegistry.connect(requester).callStatic.createJob(
    reward,
    deadline,
    specHash,
    specUri
  );
  const createTx = await jobRegistry.connect(requester).createJob(
    reward,
    deadline,
    specHash,
    specUri
  );
  const createReceipt = await createTx.wait();
  const jobId = Number(callResult);

  const stakeWorkerTx = await stakeManager
    .connect(worker)
    .depositStake(0, workerStake);
  await stakeWorkerTx.wait();

  const validatorStakeTxs: string[] = [];
  for (const [idx, validator] of validators.entries()) {
    const tx = await stakeManager.connect(validator).depositStake(1, validatorStake);
    await tx.wait();
    validatorStakeTxs.push(tx.hash);
  }

  fs.writeFileSync(
    path.join(reportDir, 'mission.md'),
    [
      '# α‑AGI MARK — Mission Report',
      `- network: ${network}`,
      `- jobId: ${jobId}`,
      `- reward: ${rewardHuman} AGIALPHA`,
      `- employerLock: ${totalEmployerLock.toString()}`,
      `- createTx: ${createTx.hash}`
    ].join('\n') + '\n'
  );

  fs.writeFileSync(
    path.join(receiptsDir, 'approvals.json'),
    JSON.stringify({ approvals }, null, 2)
  );

  fs.writeFileSync(
    path.join(receiptsDir, 'stakes.json'),
    JSON.stringify(
      {
        workerStakeTx: stakeWorkerTx.hash,
        validatorStakeTxs
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(receiptsDir, 'job.json'),
    JSON.stringify(
      {
        jobId,
        reward: reward.toString(),
        feePct: feePct.toString(),
        fee: fee.toString(),
        deadline,
        specUri,
        tx: createTx.hash,
        receipt: createReceipt
      },
      null,
      2
    )
  );

  console.log('Market created. Continue with submissions & validation via quickstart helpers or the web UI.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
