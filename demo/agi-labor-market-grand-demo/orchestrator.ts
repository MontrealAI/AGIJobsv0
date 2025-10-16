#!/usr/bin/env ts-node
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { parse as parseUrl } from 'url';

interface TimelineEntry {
  kind: string;
  label: string;
  at: string;
  scenario?: string;
}

interface ActorProfile {
  name: string;
  role: string;
  address: string;
}

interface MintedCertificate {
  jobId: string;
  owner: string;
  uri?: string;
}

interface MarketSummary {
  totalJobs: string;
  totalBurned: string;
  finalSupply: string;
  feePct: number;
  validatorRewardPct: number;
  pendingFees: string;
  totalAgentStake: string;
  totalValidatorStake: string;
  mintedCertificates: MintedCertificate[];
}

interface PauseStatus {
  registry: boolean;
  stake: boolean;
  validation: boolean;
}

interface OwnerControlSnapshot {
  ownerAddress: string;
  moderatorAddress: string;
  baseline: { feePct: number; validatorRewardPct: number; burnPct: number };
  upgraded: { feePct: number; validatorRewardPct: number; burnPct: number };
  restored: { feePct: number; validatorRewardPct: number; burnPct: number };
  pauseDrill: { owner: PauseStatus; moderator: PauseStatus };
}

interface ScenarioExport {
  title: string;
  jobId: string;
  timelineIndices: number[];
}

interface OwnerActionRecord {
  label: string;
  contract: string;
  method: string;
  parameters?: Record<string, unknown>;
  at: string;
}

interface DemoExportPayload {
  generatedAt: string;
  network: string;
  actors: ActorProfile[];
  ownerActions: OwnerActionRecord[];
  timeline: TimelineEntry[];
  scenarios: ScenarioExport[];
  market: MarketSummary;
  ownerControl?: OwnerControlSnapshot;
}

interface OrchestratorOptions {
  port: number;
  skipSimulation: boolean;
  openBrowser: boolean;
}

const ROOT = path.resolve(__dirname, '..', '..');
const UI_ROOT = path.join(ROOT, 'demo', 'agi-labor-market-grand-demo', 'ui');
const EXPORT_PATH = path.join(UI_ROOT, 'export', 'latest.json');
const DEFAULT_PORT = 4317;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(): OrchestratorOptions {
  const argv = process.argv.slice(2);
  const options: OrchestratorOptions = {
    port: DEFAULT_PORT,
    skipSimulation: false,
    openBrowser: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const value = argv[i + 1];

    switch (token) {
      case '--port': {
        const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
        if (!Number.isNaN(parsed)) {
          options.port = parsed;
          i += 1;
        }
        break;
      }
      case '--skip-simulation':
        options.skipSimulation = true;
        break;
      case '--open':
        options.openBrowser = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function spawnLocalBinary(binary: string): string {
  return process.platform === 'win32' ? `${binary}.cmd` : binary;
}

async function runSimulation(exportPath: string): Promise<void> {
  console.log('\n🧠 Initialising autonomous labour market mission...');
  const args = [
    'hardhat',
    'run',
    '--no-compile',
    '--network',
    'hardhat',
    path.join('scripts', 'v2', 'agiLaborMarketGrandDemo.ts'),
  ];

  await fs.mkdir(path.dirname(exportPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(spawnLocalBinary('npx'), args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        AGI_JOBS_DEMO_EXPORT: exportPath,
      },
    });

    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Hardhat demo exited with code ${code}`));
    });
  });
}

async function readTranscript(exportPath: string): Promise<DemoExportPayload> {
  const raw = await fs.readFile(exportPath, 'utf8');
  return JSON.parse(raw) as DemoExportPayload;
}

function logOwnerAuthority(ownerControl?: OwnerControlSnapshot): void {
  if (!ownerControl) {
    console.log('\n⚠️  Owner control snapshot missing – rerun the simulation to regenerate authority proofs.');
    return;
  }

  console.log('\n🛡️  Owner sovereignty verification');
  console.log(`   Owner wallet:    ${ownerControl.ownerAddress}`);
  console.log(`   Moderator drill: ${ownerControl.moderatorAddress}`);
  console.log(
    `   Fee controls → baseline ${ownerControl.baseline.feePct}% → live ${ownerControl.upgraded.feePct}% → restored ${ownerControl.restored.feePct}%`
  );
  const ownerDrill = ownerControl.pauseDrill.owner;
  const moderatorDrill = ownerControl.pauseDrill.moderator;
  const ownerHasFullControl = ownerDrill.registry && ownerDrill.stake && ownerDrill.validation;
  const moderatorDelegated = moderatorDrill.registry && moderatorDrill.stake && moderatorDrill.validation;

  console.log(
    `   Owner emergency drill complete: registry=${ownerDrill.registry} stake=${ownerDrill.stake} validation=${ownerDrill.validation}`
  );
  console.log(
    `   Delegated moderator drill complete: registry=${moderatorDrill.registry} stake=${moderatorDrill.stake} validation=${moderatorDrill.validation}`
  );

  if (ownerHasFullControl && moderatorDelegated) {
    console.log('   ✅ Contract owner retains total authority and can recover operations instantly.');
  } else {
    console.log('   ❌ Authority check failed – inspect the owner control timeline before proceeding.');
  }
}

function logMarketSummary(market: MarketSummary): void {
  console.log('\n📊 Sovereign labour market telemetry');
  console.log(`   Jobs orchestrated: ${market.totalJobs}`);
  console.log(`   Total AGIα burned: ${market.totalBurned}`);
  console.log(`   Circulating supply: ${market.finalSupply}`);
  console.log(`   Protocol fee: ${market.feePct}% | Validator share: ${market.validatorRewardPct}%`);
  console.log(`   Fee pool pending distribution: ${market.pendingFees}`);
  console.log(`   Agent capital at work: ${market.totalAgentStake}`);
  console.log(`   Validator capital at work: ${market.totalValidatorStake}`);
  if (market.mintedCertificates.length) {
    console.log('   Certificates minted:');
    for (const cert of market.mintedCertificates) {
      console.log(`     • Job #${cert.jobId} → ${cert.owner}`);
    }
  } else {
    console.log('   Certificates minted: none yet – rerun the cooperative scenario to mint credentials.');
  }
}

function logNarrative(data: DemoExportPayload): void {
  console.log('\n🧾 Mission timeline highlights');
  const notable = data.timeline.filter((entry) => entry.kind === 'section' || entry.kind === 'job-summary').slice(0, 10);
  for (const entry of notable) {
    const time = new Date(entry.at).toLocaleString();
    const scope = entry.scenario ? `[${entry.scenario}] ` : '';
    console.log(`   • ${time} ${scope}${entry.label}`);
  }
  console.log(`   (${data.timeline.length} events captured – explore them all in the UI.)`);
}

function logOwnerCommands(actions: OwnerActionRecord[]): void {
  if (!actions.length) return;
  console.log('\n🧭 Owner command log (first 10 actions)');
  for (const action of actions.slice(0, 10)) {
    const time = new Date(action.at).toLocaleTimeString();
    const parameters = action.parameters && Object.keys(action.parameters).length
      ? JSON.stringify(action.parameters)
      : '—';
    console.log(`   • ${time} ${action.label} → ${action.contract}.${action.method}(${parameters})`);
  }
  if (actions.length > 10) {
    console.log(`   … ${actions.length - 10} additional owner actions recorded.`);
  }
}

async function findAvailablePort(preferred: number): Promise<number> {
  let port = preferred;
  while (port < preferred + 50) {
    const candidate = await new Promise<number>((resolve) => {
      const tester = createServer();
      tester.once('error', () => resolve(-1));
      tester.once('listening', () => tester.close(() => resolve(port)));
      tester.listen(port, '0.0.0.0');
    });
    if (candidate !== -1) return candidate;
    port += 1;
  }
  throw new Error('Unable to find an available port in range.');
}

function getContentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

async function serveStaticFile(filePath: string, res: ServerResponse): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      return serveStaticFile(path.join(filePath, 'index.html'), res);
    }
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Content-Length': content.length,
      'Cache-Control': 'no-store',
    });
    res.end(content);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    console.warn('Static file not found', filePath, error);
  }
}

function createStaticServer(root: string) {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestUrl = req.url || '/';
    const decoded = parseUrl(requestUrl).pathname || '/';
    const safePath = path.normalize(decoded).replace(/^\/+/, '');
    const target = path.join(root, safePath);
    serveStaticFile(target, res);
  });
}

async function maybeOpenBrowser(port: number): Promise<void> {
  const urlToOpen = `http://localhost:${port}`;
  const platform = process.platform;
  const commands: Record<string, string> = {
    darwin: 'open',
    win32: 'start',
    linux: 'xdg-open',
  };
  const binary = commands[platform];
  if (!binary) {
    console.log(`   (Browser auto-open unavailable on ${platform}. Navigate manually to ${urlToOpen})`);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, [urlToOpen], { detached: true, stdio: 'ignore', shell: platform === 'win32' });
    child.on('error', reject);
    child.unref();
    resolve();
  });
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (!options.skipSimulation) {
    await runSimulation(EXPORT_PATH);
  } else if (!(await fileExists(EXPORT_PATH))) {
    throw new Error(`Transcript not found at ${EXPORT_PATH}. Remove --skip-simulation to generate it.`);
  }

  const transcript = await readTranscript(EXPORT_PATH);

  console.log('\n🪐 Transcript loaded. Rendering executive intelligence briefing...');
  console.log(`   Generated at: ${new Date(transcript.generatedAt).toLocaleString()}`);
  console.log(`   Network preset: ${transcript.network}`);
  console.log(`   Participants on stage: ${transcript.actors.length}`);
  logOwnerAuthority(transcript.ownerControl);
  logMarketSummary(transcript.market);
  logNarrative(transcript);
  logOwnerCommands(transcript.ownerActions);

  const port = await findAvailablePort(options.port);
  const server = createStaticServer(UI_ROOT);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve());
  });

  const dashboardUrl = `http://localhost:${port}`;
  console.log(`\n🌐 Sovereign control room available at ${dashboardUrl}`);
  console.log('   Press Ctrl+C to terminate the control room server.');

  if (options.openBrowser) {
    try {
      await maybeOpenBrowser(port);
    } catch (error) {
      console.warn('   Unable to open browser automatically:', error);
    }
  }

  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down sovereign control room.');
    server.close(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    console.log('\n👋 Received termination signal. Closing control room.');
    server.close(() => process.exit(0));
  });
}

main().catch((error) => {
  console.error('\n❌ Cosmic orchestrator failed:', error instanceof Error ? error.message : error);
  if (process.env.DEBUG) {
    console.error(error);
  }
  process.exitCode = 1;
});
