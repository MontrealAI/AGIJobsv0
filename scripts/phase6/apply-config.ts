#!/usr/bin/env ts-node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import hre from 'hardhat';
import { Contract } from 'ethers';
import { fetchPhase6State, loadPhase6Config, planPhase6Changes, Phase6Config } from './apply-config-lib';

const DEFAULT_CONFIG = 'demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json';

const MANAGER_ABI = [
  'function SPEC_VERSION() view returns (string)',
  'function governance() view returns (address)',
  'function globalConfig() view returns (address,address,address,address,uint64,string)',
  'function globalGuards() view returns (uint16,uint16,uint32,bool,address)',
  'function systemPause() view returns (address)',
  'function escalationBridge() view returns (address)',
  'function listDomains() view returns ((bytes32 id,(string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)[])',
  'function setGlobalConfig((address,address,address,address,uint64,string) config)',
  'function setGlobalGuards((uint16,uint16,uint32,bool,address) config)',
  'function setSystemPause(address newPause)',
  'function setEscalationBridge(address newBridge)',
  'function registerDomain((string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)',
  'function updateDomain(bytes32 id,(string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)',
  'function setDomainOperations(bytes32 id,(uint48 maxActiveJobs,uint48 maxQueueDepth,uint96 minStake,uint16 treasuryShareBps,uint16 circuitBreakerBps,bool requiresHumanValidation) config)',
  'function getDomainOperations(bytes32 id) view returns (uint48 maxActiveJobs,uint48 maxQueueDepth,uint96 minStake,uint16 treasuryShareBps,uint16 circuitBreakerBps,bool requiresHumanValidation)',
];

interface CliArgs {
  manager?: string;
  configPath: string;
  dryRun: boolean;
  onlyDomains: Set<string>;
  skipGlobal: boolean;
  skipSystemPause: boolean;
  skipEscalation: boolean;
}

function printUsage(): void {
  console.log(`Phase 6 expansion manager applier\n\n` +
    `Usage: npx hardhat run --no-compile scripts/phase6/apply-config.ts --network <network> -- --manager <address> [options]\n\n` +
    `Options:\n` +
    `  --manager <address>       Address of the Phase6ExpansionManager contract (required)\n` +
    `  --config <path>           Path to the Phase 6 config JSON (default: ${DEFAULT_CONFIG})\n` +
    `  --apply                   Execute transactions (default: dry-run)\n` +
    `  --dry-run                 Force dry-run mode (no transactions)\n` +
    `  --domain <slug>[,slug]    Only process specific domain slugs\n` +
    `  --skip-global             Do not call setGlobalConfig even if differences exist\n` +
    `  --skip-pause              Skip setSystemPause even if address differs\n` +
    `  --skip-escalation         Skip setEscalationBridge even if address differs\n` +
    `  --help                    Show this message\n`);
}

function getScriptArgv(): string[] {
  const rawArgv = process.argv.slice(2);

  const separatorIdx = rawArgv.indexOf('--');
  if (separatorIdx !== -1) {
    return rawArgv.slice(separatorIdx + 1);
  }

  const scriptIdx = rawArgv.findIndex((value) => {
    return value.endsWith('apply-config.ts') || value.endsWith('apply-config.js');
  });
  const afterScript = scriptIdx !== -1 ? rawArgv.slice(scriptIdx + 1) : rawArgv;

  const hardhatFlagsWithValues = new Set(['--network', '--config', '--tsconfig']);
  const hardhatBooleanFlags = new Set(['--no-compile', '--show-stack-traces', '--verbose']);

  const argv: string[] = [];
  for (let i = 0; i < afterScript.length; i += 1) {
    const value = afterScript[i];
    if (value === '--') {
      argv.push(...afterScript.slice(i + 1));
      break;
    }
    if (hardhatFlagsWithValues.has(value)) {
      i += 1;
      continue;
    }
    const [flagName] = value.split('=');
    if (hardhatFlagsWithValues.has(flagName)) {
      continue;
    }
    if (hardhatBooleanFlags.has(value)) {
      continue;
    }
    if (value === 'run') {
      continue;
    }
    if (value.endsWith('apply-config.ts') || value.endsWith('apply-config.js')) {
      continue;
    }
    argv.push(value);
  }

  return argv;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    configPath: DEFAULT_CONFIG,
    dryRun: true,
    onlyDomains: new Set<string>(),
    skipGlobal: false,
    skipSystemPause: false,
    skipEscalation: false,
  };
  const argv = getScriptArgv();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--manager':
        if (!next) throw new Error('--manager <address> required');
        args.manager = next;
        i += 1;
        break;
      case '--config':
        if (!next) throw new Error('--config <path> required');
        args.configPath = next;
        i += 1;
        break;
      case '--apply':
        args.dryRun = false;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--domain':
        if (!next) throw new Error('--domain expects comma separated slugs');
        next.split(',')
          .map((slug) => slug.trim().toLowerCase())
          .filter(Boolean)
          .forEach((slug) => args.onlyDomains.add(slug));
        i += 1;
        break;
      case '--skip-global':
        args.skipGlobal = true;
        break;
      case '--skip-pause':
        args.skipSystemPause = true;
        break;
      case '--skip-escalation':
        args.skipEscalation = true;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        break;
    }
  }
  if (!args.manager) {
    throw new Error('Provide --manager <address>');
  }
  return args;
}

function assertConfig(config: Phase6Config): void {
  if (!config.global.manifestURI) {
    throw new Error('Configuration global.manifestURI must be set.');
  }
  if (!config.global.guards) {
    throw new Error('Configuration global.guards must be provided.');
  }
  const guards = config.global.guards;
  ['treasuryBufferBps', 'circuitBreakerBps', 'anomalyGracePeriod'].forEach((key) => {
    const value = (guards as any)[key];
    if (typeof value !== 'number' || value < 0) {
      throw new Error(`global.guards.${key} must be a non-negative number.`);
    }
  });
  if (guards.treasuryBufferBps > 10000) {
    throw new Error('global.guards.treasuryBufferBps must be <= 10000.');
  }
  if (guards.circuitBreakerBps > 10000) {
    throw new Error('global.guards.circuitBreakerBps must be <= 10000.');
  }
  if (guards.anomalyGracePeriod !== 0 && guards.anomalyGracePeriod < 30) {
    throw new Error('global.guards.anomalyGracePeriod must be 0 or >= 30 seconds.');
  }
  if (typeof guards.autoPauseEnabled !== 'boolean') {
    throw new Error('global.guards.autoPauseEnabled must be a boolean.');
  }
  if (!guards.oversightCouncil || !guards.oversightCouncil.startsWith('0x')) {
    throw new Error('global.guards.oversightCouncil must be a 0x-prefixed address.');
  }
  if (!config.domains.length) {
    throw new Error('Configuration must include at least one domain.');
  }
  for (const domain of config.domains) {
    if (!domain.slug || !domain.validationModule) {
      throw new Error(`Domain ${domain.slug || '<unnamed>'} missing slug or validationModule.`);
    }
    if (!domain.operations) {
      throw new Error(`Domain ${domain.slug} missing operations configuration.`);
    }
    const ops = domain.operations;
    if (typeof ops.maxActiveJobs !== 'number' || ops.maxActiveJobs <= 0) {
      throw new Error(`Domain ${domain.slug} operations.maxActiveJobs must be a positive number.`);
    }
    if (typeof ops.maxQueueDepth !== 'number' || ops.maxQueueDepth < ops.maxActiveJobs) {
      throw new Error(`Domain ${domain.slug} operations.maxQueueDepth must be >= maxActiveJobs.`);
    }
    const minStake = typeof ops.minStake === 'string' ? ops.minStake : Number(ops.minStake ?? 0);
    if (!minStake || Number(minStake) <= 0) {
      throw new Error(`Domain ${domain.slug} operations.minStake must be > 0.`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const configPath = resolve(args.configPath);
  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const config = loadPhase6Config(configPath);
  assertConfig(config);

  const { ethers } = hre as any;
  const [signer] = await ethers.getSigners();
  const manager: Contract = new ethers.Contract(args.manager, MANAGER_ABI, signer);

  const [network, chainId] = await Promise.all([hre.network.name, signer.provider?.getNetwork()]);
  const specVersion = await manager.SPEC_VERSION();
  const governance = await manager.governance();

  console.log(`\n🚀 Phase 6 apply-config (network=${network}, chainId=${chainId?.chainId ?? 'unknown'})`);
  console.log(`Manager: ${args.manager}`);
  console.log(`Spec version: ${specVersion}`);
  console.log(`Signer: ${await signer.getAddress()}`);
  console.log(`Governance (owner): ${governance}`);
  console.log(`Config: ${configPath}`);

  const state = await fetchPhase6State(manager);
  const plan = planPhase6Changes(state, config);

  plan.warnings.forEach((warning) => console.warn(`⚠️  ${warning}`));

  const actions: Array<{ label: string; run: () => Promise<void> }> = [];

  if (!args.skipGlobal && plan.global) {
    actions.push({
      label: `setGlobalConfig → ${plan.global.diffs.join(', ')}`,
      run: async () => {
        const tx = await manager.setGlobalConfig(plan.global!.config);
        console.log(`⏳ setGlobalConfig submitted: ${tx.hash}`);
        await tx.wait();
        console.log('✅ setGlobalConfig confirmed');
      },
    });
  }

  if (!args.skipSystemPause && plan.systemPause) {
    actions.push({
      label: `setSystemPause → ${plan.systemPause.target}`,
      run: async () => {
        const tx = await manager.setSystemPause(plan.systemPause!.target);
        console.log(`⏳ setSystemPause submitted: ${tx.hash}`);
        await tx.wait();
        console.log('✅ setSystemPause confirmed');
      },
    });
  }

  if (!args.skipEscalation && plan.escalationBridge) {
    actions.push({
      label: `setEscalationBridge → ${plan.escalationBridge.target}`,
      run: async () => {
        const tx = await manager.setEscalationBridge(plan.escalationBridge!.target);
        console.log(`⏳ setEscalationBridge submitted: ${tx.hash}`);
        await tx.wait();
        console.log('✅ setEscalationBridge confirmed');
      },
    });
  }

  if (plan.globalGuards) {
    actions.push({
      label: `setGlobalGuards → ${plan.globalGuards.diffs.join(', ')}`,
      run: async () => {
        const tx = await manager.setGlobalGuards(plan.globalGuards!.config);
        console.log(`⏳ setGlobalGuards submitted: ${tx.hash}`);
        await tx.wait();
        console.log('✅ setGlobalGuards confirmed');
      },
    });
  }

  for (const domainPlan of plan.domains) {
    if (args.onlyDomains.size > 0 && !args.onlyDomains.has(domainPlan.slug.toLowerCase())) {
      continue;
    }
    if (domainPlan.action === 'registerDomain') {
      actions.push({
        label: `registerDomain(${domainPlan.slug})`,
        run: async () => {
          const tx = await manager.registerDomain(domainPlan.config);
          console.log(`⏳ registerDomain ${domainPlan.slug} submitted: ${tx.hash}`);
          await tx.wait();
          console.log('✅ registerDomain confirmed');
        },
      });
    } else {
      actions.push({
        label: `updateDomain(${domainPlan.slug}) → ${domainPlan.diffs.join(', ')}`,
        run: async () => {
          const tx = await manager.updateDomain(domainPlan.id, domainPlan.config);
          console.log(`⏳ updateDomain ${domainPlan.slug} submitted: ${tx.hash}`);
          await tx.wait();
          console.log('✅ updateDomain confirmed');
        },
      });
    }
  }

  for (const opsPlan of plan.domainOperations) {
    if (args.onlyDomains.size > 0 && !args.onlyDomains.has(opsPlan.slug.toLowerCase())) {
      continue;
    }
    actions.push({
      label: `setDomainOperations(${opsPlan.slug}) → ${opsPlan.diffs.join(', ')}`,
      run: async () => {
        const tx = await manager.setDomainOperations(opsPlan.id, opsPlan.config);
        console.log(`⏳ setDomainOperations ${opsPlan.slug} submitted: ${tx.hash}`);
        await tx.wait();
        console.log('✅ setDomainOperations confirmed');
      },
    });
  }

  if (actions.length === 0) {
    console.log('✨ No changes required. On-chain state matches configuration.');
    return;
  }

  console.log(`\nPlanned actions (${actions.length}):`);
  actions.forEach((action, index) => {
    console.log(`  [${index + 1}] ${action.label}`);
  });

  if (args.dryRun) {
    console.log('\n🛠️  Dry run complete. Re-run with --apply to execute transactions.');
    return;
  }

  for (const action of actions) {
    await action.run();
  }

  console.log('\n✅ Phase 6 configuration applied successfully.');
}

main().catch((error) => {
  console.error('Phase 6 apply-config failed:', error);
  process.exitCode = 1;
});
