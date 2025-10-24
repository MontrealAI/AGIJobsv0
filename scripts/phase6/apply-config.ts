#!/usr/bin/env ts-node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import hre from 'hardhat';
import { Contract } from 'ethers';
import {
  fetchPhase6State,
  loadPhase6Config,
  planPhase6Changes,
  Phase6Config,
} from './apply-config-lib';

const DEFAULT_CONFIG = 'demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json';

const MANAGER_ABI = [
  'function SPEC_VERSION() view returns (string)',
  'function governance() view returns (address)',
  'function globalConfig() view returns (address,address,address,address,uint64,string)',
  'function globalGuards() view returns (uint16,uint16,uint32,bool,address)',
  'function globalTelemetry() view returns (bytes32,bytes32,uint32,uint32,uint32)',
  'function systemPause() view returns (address)',
  'function escalationBridge() view returns (address)',
  'function listDomains() view returns ((bytes32 id,(string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)[])',
  'function setGlobalConfig((address,address,address,address,uint64,string) config)',
  'function setGlobalGuards((uint16,uint16,uint32,bool,address) config)',
  'function setGlobalTelemetry((bytes32 manifestHash,bytes32 metricsDigest,uint32 resilienceFloorBps,uint32 automationFloorBps,uint32 oversightWeightBps) telemetry)',
  'function setSystemPause(address newPause)',
  'function setEscalationBridge(address newBridge)',
  'function registerDomain((string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)',
  'function updateDomain(bytes32 id,(string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)',
  'function setDomainOperations(bytes32 id,(uint48 maxActiveJobs,uint48 maxQueueDepth,uint96 minStake,uint16 treasuryShareBps,uint16 circuitBreakerBps,bool requiresHumanValidation) config)',
  'function setDomainTelemetry(bytes32 id,(uint32 resilienceBps,uint32 automationBps,uint32 complianceBps,uint32 settlementLatencySeconds,bool usesL2Settlement,address sentinelOracle,address settlementAsset,bytes32 metricsDigest,bytes32 manifestHash) telemetry)',
  'function getDomainOperations(bytes32 id) view returns (uint48 maxActiveJobs,uint48 maxQueueDepth,uint96 minStake,uint16 treasuryShareBps,uint16 circuitBreakerBps,bool requiresHumanValidation)',
  'function getDomainTelemetry(bytes32 id) view returns (uint32,uint32,uint32,uint32,bool,address,address,bytes32,bytes32)',
];

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function assertNonZeroAddress(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !ADDRESS_PATTERN.test(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${field} must be a non-zero 0x-prefixed address.`);
  }
}

function assertOptionalAddress(value: unknown, field: string): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== 'string' || !ADDRESS_PATTERN.test(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${field} must be a valid 0x-prefixed address when provided.`);
  }
}

function assertBytes32(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length !== 66 || !value.startsWith('0x')) {
    throw new Error(`${field} must be a bytes32 hex string.`);
  }
  return value;
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function toFiniteNumber(value: unknown, field: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return numeric;
}

function assertBps(value: unknown, field: string): number {
  const numeric = toFiniteNumber(value, field);
  if (numeric < 0 || numeric > 10000) {
    throw new Error(`${field} must be between 0 and 10000.`);
  }
  return numeric;
}

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
  const global = config.global;
  assertNonEmptyString(global.manifestURI, 'Configuration global.manifestURI');
  ['iotOracleRouter', 'defaultL2Gateway', 'didRegistry', 'treasuryBridge', 'systemPause', 'escalationBridge'].forEach((key) => {
    assertNonZeroAddress((global as any)[key], `global.${key}`);
  });
  if (global.l2SyncCadence !== undefined && global.l2SyncCadence !== null) {
    const cadence = Number(global.l2SyncCadence);
    if (!Number.isFinite(cadence) || cadence < 30) {
      throw new Error('global.l2SyncCadence must be >= 30 seconds when defined.');
    }
  }

  if (!global.guards) {
    throw new Error('Configuration global.guards must be provided.');
  }
  const guards = global.guards;
  assertBps(guards.treasuryBufferBps, 'global.guards.treasuryBufferBps');
  assertBps(guards.circuitBreakerBps, 'global.guards.circuitBreakerBps');
  const anomalyGrace = toFiniteNumber(guards.anomalyGracePeriod, 'global.guards.anomalyGracePeriod');
  if (anomalyGrace !== 0 && anomalyGrace < 30) {
    throw new Error('global.guards.anomalyGracePeriod must be 0 or >= 30 seconds.');
  }
  if (typeof guards.autoPauseEnabled !== 'boolean') {
    throw new Error('global.guards.autoPauseEnabled must be a boolean.');
  }
  assertNonZeroAddress(guards.oversightCouncil, 'global.guards.oversightCouncil');

  if (!Array.isArray(global.decentralizedInfra) || global.decentralizedInfra.length < 3) {
    throw new Error('global.decentralizedInfra must include at least three integrations.');
  }
  global.decentralizedInfra.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`global.decentralizedInfra[${index}] must be an object.`);
    }
    assertNonEmptyString(entry.name, `global.decentralizedInfra[${index}].name`);
    assertNonEmptyString(entry.role, `global.decentralizedInfra[${index}].role`);
    assertNonEmptyString(entry.status, `global.decentralizedInfra[${index}].status`);
    if (entry.endpoint !== undefined && typeof entry.endpoint !== 'string') {
      throw new Error(`global.decentralizedInfra[${index}].endpoint must be a string when provided.`);
    }
  });

  if (!global.telemetry) {
    throw new Error('Configuration global.telemetry must be provided.');
  }
  const globalTelemetry = global.telemetry;
  assertBytes32(globalTelemetry.manifestHash, 'global.telemetry.manifestHash');
  assertBytes32(globalTelemetry.metricsDigest, 'global.telemetry.metricsDigest');
  assertBps(globalTelemetry.resilienceFloorBps, 'global.telemetry.resilienceFloorBps');
  assertBps(globalTelemetry.automationFloorBps, 'global.telemetry.automationFloorBps');
  assertBps(globalTelemetry.oversightWeightBps, 'global.telemetry.oversightWeightBps');

  if (!Array.isArray(config.domains) || config.domains.length === 0) {
    throw new Error('Configuration must include at least one domain.');
  }
  const seenSlugs = new Set<string>();

  for (const domain of config.domains) {
    const slug = assertNonEmptyString(domain.slug, 'domain.slug').toLowerCase();
    if (seenSlugs.has(slug)) {
      throw new Error(`Domain ${domain.slug} is defined multiple times.`);
    }
    seenSlugs.add(slug);
    assertNonEmptyString(domain.name, `domain ${domain.slug} name`);
    assertNonEmptyString(domain.manifestURI, `domain ${domain.slug} manifestURI`);
    assertNonEmptyString(domain.subgraph, `domain ${domain.slug} subgraph`);
    assertNonZeroAddress(domain.validationModule, `domain ${domain.slug} validationModule`);
    assertOptionalAddress(domain.oracle, `domain ${domain.slug} oracle`);
    assertOptionalAddress(domain.l2Gateway, `domain ${domain.slug} l2Gateway`);
    assertOptionalAddress(domain.executionRouter, `domain ${domain.slug} executionRouter`);
    if (domain.heartbeatSeconds !== undefined && domain.heartbeatSeconds < 30) {
      throw new Error(`domain ${domain.slug} heartbeatSeconds must be >= 30.`);
    }

    if (!Array.isArray(domain.skillTags) || domain.skillTags.length === 0) {
      throw new Error(`domain ${domain.slug} must define at least one skill tag.`);
    }
    domain.skillTags.forEach((tag, idx) => {
      assertNonEmptyString(tag, `domain ${domain.slug} skillTags[${idx}]`);
    });

    if (domain.capabilities !== undefined) {
      if (domain.capabilities === null || typeof domain.capabilities !== 'object') {
        throw new Error(`domain ${domain.slug} capabilities must be an object when provided.`);
      }
      Object.entries(domain.capabilities).forEach(([key, value]) => {
        toFiniteNumber(value, `domain ${domain.slug} capabilities.${key}`);
      });
    }

    if (domain.priority !== undefined) {
      const priority = toFiniteNumber(domain.priority, `domain ${domain.slug} priority`);
      if (priority < 0) {
        throw new Error(`domain ${domain.slug} priority must be >= 0.`);
      }
    }

    if (!domain.metadata || typeof domain.metadata !== 'object') {
      throw new Error(`domain ${domain.slug} metadata must be provided.`);
    }
    const metadata: Record<string, unknown> = domain.metadata;
    assertNonEmptyString(metadata.domain, `domain ${domain.slug} metadata.domain`);
    assertNonEmptyString(metadata.l2, `domain ${domain.slug} metadata.l2`);
    assertNonEmptyString(metadata.sentinel, `domain ${domain.slug} metadata.sentinel`);
    assertNonEmptyString(metadata.uptime, `domain ${domain.slug} metadata.uptime`);
    const resilienceIndex = toFiniteNumber(metadata.resilienceIndex, `domain ${domain.slug} metadata.resilienceIndex`);
    if (resilienceIndex <= 0 || resilienceIndex > 1) {
      throw new Error(`domain ${domain.slug} metadata.resilienceIndex must be between 0 and 1.`);
    }
    const valueFlow = toFiniteNumber(metadata.valueFlowMonthlyUSD, `domain ${domain.slug} metadata.valueFlowMonthlyUSD`);
    if (valueFlow <= 0) {
      throw new Error(`domain ${domain.slug} metadata.valueFlowMonthlyUSD must be > 0.`);
    }
    if (metadata.valueFlowDisplay !== undefined && typeof metadata.valueFlowDisplay !== 'string') {
      throw new Error(`domain ${domain.slug} metadata.valueFlowDisplay must be a string when provided.`);
    }

    if (!domain.operations) {
      throw new Error(`Domain ${domain.slug} missing operations configuration.`);
    }
    const ops = domain.operations;
    toFiniteNumber(ops.maxActiveJobs, `domain ${domain.slug} operations.maxActiveJobs`);
    if (ops.maxActiveJobs <= 0) {
      throw new Error(`domain ${domain.slug} operations.maxActiveJobs must be > 0.`);
    }
    toFiniteNumber(ops.maxQueueDepth, `domain ${domain.slug} operations.maxQueueDepth`);
    if (ops.maxQueueDepth < ops.maxActiveJobs) {
      throw new Error(`domain ${domain.slug} operations.maxQueueDepth must be >= maxActiveJobs.`);
    }
    try {
      const minStakeValue = typeof ops.minStake === 'string' ? ops.minStake : String(ops.minStake ?? '0');
      if (BigInt(minStakeValue) <= 0n) {
        throw new Error();
      }
    } catch (error) {
      throw new Error(`domain ${domain.slug} operations.minStake must be a positive integer string.`);
    }
    assertBps(ops.treasuryShareBps, `domain ${domain.slug} operations.treasuryShareBps`);
    assertBps(ops.circuitBreakerBps, `domain ${domain.slug} operations.circuitBreakerBps`);
    if (typeof ops.requiresHumanValidation !== 'boolean') {
      throw new Error(`domain ${domain.slug} operations.requiresHumanValidation must be boolean.`);
    }

    if (!domain.telemetry) {
      throw new Error(`domain ${domain.slug} telemetry must be provided.`);
    }
    const telemetry = domain.telemetry;
    assertBps(telemetry.resilienceBps, `domain ${domain.slug} telemetry.resilienceBps`);
    assertBps(telemetry.automationBps, `domain ${domain.slug} telemetry.automationBps`);
    assertBps(telemetry.complianceBps, `domain ${domain.slug} telemetry.complianceBps`);
    const latency = toFiniteNumber(telemetry.settlementLatencySeconds, `domain ${domain.slug} telemetry.settlementLatencySeconds`);
    if (latency < 0) {
      throw new Error(`domain ${domain.slug} telemetry.settlementLatencySeconds must be >= 0.`);
    }
    if (typeof telemetry.usesL2Settlement !== 'boolean') {
      throw new Error(`domain ${domain.slug} telemetry.usesL2Settlement must be boolean.`);
    }
    assertOptionalAddress(telemetry.sentinelOracle, `domain ${domain.slug} telemetry.sentinelOracle`);
    assertOptionalAddress(telemetry.settlementAsset, `domain ${domain.slug} telemetry.settlementAsset`);
    assertBytes32(telemetry.metricsDigest, `domain ${domain.slug} telemetry.metricsDigest`);
    assertBytes32(telemetry.manifestHash, `domain ${domain.slug} telemetry.manifestHash`);

    if (!Array.isArray(domain.infrastructure) || domain.infrastructure.length < 3) {
      throw new Error(`domain ${domain.slug} infrastructure must include at least three integrations.`);
    }
    domain.infrastructure.forEach((integration, infraIndex) => {
      if (!integration || typeof integration !== 'object') {
        throw new Error(`domain ${domain.slug} infrastructure[${infraIndex}] must be an object.`);
      }
      assertNonEmptyString(integration.layer, `domain ${domain.slug} infrastructure[${infraIndex}].layer`);
      assertNonEmptyString(integration.name, `domain ${domain.slug} infrastructure[${infraIndex}].name`);
      assertNonEmptyString(integration.role, `domain ${domain.slug} infrastructure[${infraIndex}].role`);
      assertNonEmptyString(integration.status, `domain ${domain.slug} infrastructure[${infraIndex}].status`);
      if (integration.endpoint !== undefined && typeof integration.endpoint !== 'string') {
        throw new Error(`domain ${domain.slug} infrastructure[${infraIndex}].endpoint must be a string when provided.`);
      }
      if (integration.uri !== undefined && typeof integration.uri !== 'string') {
        throw new Error(`domain ${domain.slug} infrastructure[${infraIndex}].uri must be a string when provided.`);
      }
    });
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

  if (plan.globalTelemetry) {
    actions.push({
      label: `setGlobalTelemetry → ${plan.globalTelemetry.diffs.join(', ')}`,
      run: async () => {
        const tx = await manager.setGlobalTelemetry(plan.globalTelemetry!.config);
        console.log(`⏳ setGlobalTelemetry submitted: ${tx.hash}`);
        await tx.wait();
        console.log('✅ setGlobalTelemetry confirmed');
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

  for (const telemetryPlan of plan.domainTelemetry) {
    if (args.onlyDomains.size > 0 && !args.onlyDomains.has(telemetryPlan.slug.toLowerCase())) {
      continue;
    }
    actions.push({
      label: `setDomainTelemetry(${telemetryPlan.slug}) → ${telemetryPlan.diffs.join(', ')}`,
      run: async () => {
        const tx = await manager.setDomainTelemetry(telemetryPlan.id, telemetryPlan.config);
        console.log(`⏳ setDomainTelemetry ${telemetryPlan.slug} submitted: ${tx.hash}`);
        await tx.wait();
        console.log('✅ setDomainTelemetry confirmed');
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
