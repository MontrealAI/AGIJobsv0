import { Interface, keccak256, toUtf8Bytes } from 'ethers';

const zeroAddress = '0x0000000000000000000000000000000000000000';
const zeroBytes32 = '0x' + '0'.repeat(64);
const ensureArray = (value) => (Array.isArray(value) ? value : []);

// Pure preview projections. Callers validate configuration before using these values.
function buildDomainTuple(domain) {
  return [
    domain.slug,
    domain.name,
    domain.manifestURI,
    domain.validationModule ?? zeroAddress,
    domain.oracle ?? zeroAddress,
    domain.l2Gateway ?? zeroAddress,
    domain.subgraph,
    domain.executionRouter ?? zeroAddress,
    BigInt(domain.heartbeatSeconds ?? 120),
    (domain.lifecycle ?? 'active') === 'active' && domain.active !== false,
  ];
}

function buildDomainOperationsTuple(domain) {
  const ops = domain.operations ?? {};
  const minStakeRaw = ops.minStake ?? 0;
  const minStake =
    typeof minStakeRaw === 'string'
      ? BigInt(minStakeRaw)
      : BigInt(Math.trunc(Number(minStakeRaw)));
  return [
    BigInt(Math.trunc(Number(ops.maxActiveJobs ?? 0))),
    BigInt(Math.trunc(Number(ops.maxQueueDepth ?? 0))),
    minStake,
    Number(ops.treasuryShareBps ?? 0),
    Number(ops.circuitBreakerBps ?? 0),
    Boolean(ops.requiresHumanValidation),
  ];
}

function buildDomainTelemetryTuple(domain) {
  const telemetry = domain.telemetry ?? {};
  const toBytes32 = (value) =>
    typeof value === 'string' && value.startsWith('0x') && value.length === 66
      ? value
      : zeroBytes32;
  return [
    Number(telemetry.resilienceBps ?? 0),
    Number(telemetry.automationBps ?? 0),
    Number(telemetry.complianceBps ?? 0),
    Number(telemetry.settlementLatencySeconds ?? 0),
    Boolean(telemetry.usesL2Settlement ?? false),
    telemetry.sentinelOracle ?? zeroAddress,
    telemetry.settlementAsset ?? zeroAddress,
    toBytes32(telemetry.metricsDigest),
    toBytes32(telemetry.manifestHash),
  ];
}

function buildDomainInfrastructureTuple(domain) {
  const control = domain.infrastructureControl ?? {};
  const cadence = Number(control.autopilotCadence ?? 0);
  const safeCadence = Number.isFinite(cadence) ? Math.trunc(cadence) : 0;
  return [
    control.agentOps ?? zeroAddress,
    control.dataPipeline ?? zeroAddress,
    control.credentialVerifier ?? zeroAddress,
    control.fallbackOperator ?? zeroAddress,
    control.controlPlaneURI ?? domain.manifestURI,
    BigInt(safeCadence),
    Boolean(control.autopilotEnabled ?? false),
  ];
}

export function computeMetrics(config) {
  const resilience = [];
  const automation = [];
  const compliance = [];
  const latency = [];
  let l2Coverage = 0;
  const valueFlows = [];
  const sentinels = new Set();
  const resilienceFloor = Number(
    config.global?.telemetry?.resilienceFloorBps ?? NaN
  );
  const automationFloor = Number(
    config.global?.telemetry?.automationFloorBps ?? NaN
  );
  let resilienceFloorBreaches = 0;
  let automationFloorBreaches = 0;
  let resilienceSampleCount = 0;
  let automationSampleCount = 0;
  let telemetryMissingCount = 0;
  const globalCredentials = config.global?.credentials ?? {};
  const globalTrustAnchors = ensureArray(globalCredentials.trustAnchors);
  const globalIssuers = ensureArray(globalCredentials.issuers);
  const globalPolicies = ensureArray(globalCredentials.policies);
  const issuerDomainCoverage = new Set();
  globalIssuers.forEach((issuer) => {
    ensureArray(issuer.domains).forEach((domain) => {
      issuerDomainCoverage.add(String(domain).toLowerCase());
    });
  });
  const globalRevocationRegistry =
    typeof globalCredentials.revocationRegistry === 'string' &&
    globalCredentials.revocationRegistry
      ? globalCredentials.revocationRegistry
      : null;
  let credentialedDomains = 0;
  let credentialRequirements = 0;
  config.domains.forEach((domain) => {
    const idx = Number.parseFloat(domain.metadata?.resilienceIndex ?? '');
    if (!Number.isNaN(idx)) {
      resilience.push(idx);
    }
    if (!domain.telemetry) telemetryMissingCount++;
    if (domain.telemetry) {
      const telemetry = domain.telemetry;
      const resilienceBps = Number(telemetry.resilienceBps ?? NaN);
      if (Number.isFinite(resilienceBps)) resilienceSampleCount++;
      if (
        !Number.isNaN(resilienceBps) &&
        !Number.isNaN(resilienceFloor) &&
        resilienceBps < resilienceFloor
      ) {
        resilienceFloorBreaches += 1;
      }
      const auto = Number(telemetry.automationBps ?? NaN);
      const comp = Number(telemetry.complianceBps ?? NaN);
      const latencySeconds = Number(telemetry.settlementLatencySeconds ?? NaN);
      if (!Number.isNaN(auto)) {
        automationSampleCount++;
        automation.push(auto);
        if (!Number.isNaN(automationFloor) && auto < automationFloor) {
          automationFloorBreaches += 1;
        }
      }
      if (!Number.isNaN(comp)) {
        compliance.push(comp);
      }
      if (!Number.isNaN(latencySeconds)) {
        latency.push(latencySeconds);
      }
      if (telemetry.usesL2Settlement) {
        l2Coverage += 1;
      }
    }
    const domainCredentials = ensureArray(domain.credentials);
    if (domainCredentials.length) {
      credentialedDomains += 1;
      credentialRequirements += domainCredentials.length;
    }
    const value = domain.metadata?.valueFlowMonthlyUSD;
    if (typeof value === 'number' && Number.isFinite(value)) {
      valueFlows.push(value);
    }
    if (
      typeof domain.metadata?.sentinel === 'string' &&
      domain.metadata.sentinel.length
    ) {
      sentinels.add(String(domain.metadata.sentinel));
    }
  });
  const averageResilience =
    resilience.length > 0
      ? resilience.reduce((acc, cur) => acc + cur, 0) / resilience.length
      : null;
  const minResilience = resilience.length > 0 ? Math.min(...resilience) : null;
  const maxResilience = resilience.length > 0 ? Math.max(...resilience) : null;
  const resilienceStdDev =
    resilience.length > 0 && averageResilience !== null
      ? Math.sqrt(
          resilience.reduce((acc, cur) => {
            const diff = cur - averageResilience;
            return acc + diff * diff;
          }, 0) / resilience.length
        )
      : null;
  const totalValueFlow = valueFlows.reduce((acc, cur) => acc + cur, 0);
  const domainCount = config.domains.length || 0;
  const computeCoverage = (breaches, samples, floor) => {
    if (Number.isNaN(floor)) {
      return null;
    }
    if (!domainCount) {
      return 0;
    }
    return (samples - breaches) / domainCount;
  };
  return {
    resilienceSampleCount,
    automationSampleCount,
    telemetryMissingCount,
    averageResilience,
    minResilience,
    maxResilience,
    resilienceStdDev,
    totalValueFlow,
    sentinelCount: sentinels.size,
    averageAutomation: automation.length
      ? automation.reduce((acc, cur) => acc + cur, 0) / automation.length
      : null,
    averageCompliance: compliance.length
      ? compliance.reduce((acc, cur) => acc + cur, 0) / compliance.length
      : null,
    averageLatency: latency.length
      ? latency.reduce((acc, cur) => acc + cur, 0) / latency.length
      : null,
    l2Coverage: config.domains.length ? l2Coverage / config.domains.length : 0,
    resilienceFloorCoverage: computeCoverage(
      resilienceFloorBreaches,
      resilienceSampleCount,
      resilienceFloor
    ),
    resilienceFloorBreaches,
    automationFloorCoverage: computeCoverage(
      automationFloorBreaches,
      automationSampleCount,
      automationFloor
    ),
    automationFloorBreaches,
    autopilotEnabled: config.domains.reduce(
      (acc, domain) =>
        domain.infrastructureControl?.autopilotEnabled ? acc + 1 : acc,
      0
    ),
    credentialCoverage: config.domains.length
      ? credentialedDomains / config.domains.length
      : 0,
    credentialedDomains,
    credentialRequirements,
    globalCredentialAnchors: globalTrustAnchors.length,
    globalCredentialIssuers: globalIssuers.length,
    globalCredentialPolicies: globalPolicies.length,
    globalCredentialDomainCoverage: issuerDomainCoverage.size,
    globalRevocationRegistry,
  };
}

export function buildCalldata(config, abi) {
  const iface = new Interface(abi);
  const calldata = [];
  const globalTuple = [
    config.global.iotOracleRouter ?? zeroAddress,
    config.global.defaultL2Gateway ?? zeroAddress,
    config.global.didRegistry ?? zeroAddress,
    config.global.treasuryBridge ?? zeroAddress,
    BigInt(config.global.l2SyncCadence ?? 180),
    config.global.manifestURI,
  ];
  const guardTuple = [
    Number(config.global.guards?.treasuryBufferBps ?? 0),
    Number(config.global.guards?.circuitBreakerBps ?? 0),
    Number(config.global.guards?.anomalyGracePeriod ?? 0),
    Boolean(config.global.guards?.autoPauseEnabled ?? false),
    config.global.guards?.oversightCouncil ?? zeroAddress,
  ];
  const telemetryTuple = [
    config.global.telemetry?.manifestHash &&
    config.global.telemetry.manifestHash.length === 66
      ? config.global.telemetry.manifestHash
      : zeroBytes32,
    config.global.telemetry?.metricsDigest &&
    config.global.telemetry.metricsDigest.length === 66
      ? config.global.telemetry.metricsDigest
      : zeroBytes32,
    Number(config.global.telemetry?.resilienceFloorBps ?? 0),
    Number(config.global.telemetry?.automationFloorBps ?? 0),
    Number(config.global.telemetry?.oversightWeightBps ?? 0),
  ];
  const infrastructureTuple = config.global.infrastructure
    ? [
        config.global.infrastructure.meshCoordinator ?? zeroAddress,
        config.global.infrastructure.dataLake ?? zeroAddress,
        config.global.infrastructure.identityBridge ?? zeroAddress,
        config.global.infrastructure.topologyURI ?? config.global.manifestURI,
        BigInt(
          Number.isFinite(Number(config.global.infrastructure.autopilotCadence))
            ? Math.trunc(Number(config.global.infrastructure.autopilotCadence))
            : 0
        ),
        Boolean(
          config.global.infrastructure.enforceDecentralizedInfra ?? false
        ),
      ]
    : null;
  calldata.push({
    label: 'setGlobalConfig(GlobalConfig)',
    data: iface.encodeFunctionData('setGlobalConfig', [globalTuple]),
  });
  if (config.global.guards) {
    calldata.push({
      label: 'setGlobalGuards(GlobalGuards)',
      data: iface.encodeFunctionData('setGlobalGuards', [guardTuple]),
    });
  }
  if (config.global.telemetry) {
    calldata.push({
      label: 'setGlobalTelemetry(GlobalTelemetry)',
      data: iface.encodeFunctionData('setGlobalTelemetry', [telemetryTuple]),
    });
  }
  if (infrastructureTuple) {
    calldata.push({
      label: 'setGlobalInfrastructure(GlobalInfrastructure)',
      data: iface.encodeFunctionData('setGlobalInfrastructure', [
        infrastructureTuple,
      ]),
    });
  }
  if (config.global.systemPause !== undefined) {
    calldata.push({
      label: 'setSystemPause(address)',
      data: iface.encodeFunctionData('setSystemPause', [
        config.global.systemPause,
      ]),
    });
  }
  if (config.global.escalationBridge !== undefined) {
    calldata.push({
      label: 'setEscalationBridge(address)',
      data: iface.encodeFunctionData('setEscalationBridge', [
        config.global.escalationBridge,
      ]),
    });
  }
  config.domains.forEach((domain) => {
    const domainId = keccak256(toUtf8Bytes(domain.slug.toLowerCase()));
    if (domain.lifecycle === 'sunset') {
      calldata.push({
        label: `removeDomain(${domain.slug})`,
        data: iface.encodeFunctionData('removeDomain', [domainId]),
      });
      return;
    }
    const tuple = buildDomainTuple(domain);
    const opsTuple = buildDomainOperationsTuple(domain);
    const telemetryTupleDomain = buildDomainTelemetryTuple(domain);
    const infraTuple = buildDomainInfrastructureTuple(domain);
    calldata.push({
      label: `registerDomain(${domain.slug})`,
      data: iface.encodeFunctionData('registerDomain', [tuple]),
    });
    calldata.push({
      label: `updateDomain(${domain.slug})`,
      data: iface.encodeFunctionData('updateDomain', [domainId, tuple]),
    });
    if (domain.operations) {
      calldata.push({
        label: `setDomainOperations(${domain.slug})`,
        data: iface.encodeFunctionData('setDomainOperations', [
          domainId,
          opsTuple,
        ]),
      });
    }
    if (domain.telemetry) {
      calldata.push({
        label: `setDomainTelemetry(${domain.slug})`,
        data: iface.encodeFunctionData('setDomainTelemetry', [
          domainId,
          telemetryTupleDomain,
        ]),
      });
    }
    if (domain.infrastructureControl) {
      calldata.push({
        label: `setDomainInfrastructure(${domain.slug})`,
        data: iface.encodeFunctionData('setDomainInfrastructure', [
          domainId,
          infraTuple,
        ]),
      });
    }
  });
  return calldata;
}
