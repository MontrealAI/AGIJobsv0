import { Interface, keccak256, toUtf8Bytes } from 'ethers';
import mermaid from 'mermaid';
import { initPlanner, resetPlanner } from './planner.mjs';
import {
  validatePhase6Config,
  parsePhase6Json,
} from '../../../scripts/phase6/config-validation.ts';

const zeroAddress = '0x0000000000000000000000000000000000000000';
const zeroBytes32 = '0x' + '0'.repeat(64);
const configPath = './config/domains.phase6.json';
let iface;

const state = { config: null, mermaidSource: '', calldata: [], metrics: null };
const html = (parts, ...values) =>
  parts.reduce(
    (out, part, index) =>
      out +
      part +
      (index < values.length
        ? String(values[index]).replace(
            /[&<>"']/g,
            (char) =>
              ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
              }[char])
          )
        : ''),
    ''
  );
const status = document.querySelector('#preview-status');
const originalSource = document.querySelector('#mermaid-original').textContent;
document.querySelector('#original-source').textContent = originalSource;
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
  flowchart: { htmlLabels: false },
});
async function json(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error('Cannot load ' + url + ' (HTTP ' + response.status + ').');
  return parsePhase6Json(await response.text());
}
const copy = async (text, label) => {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = label + ' copied.';
  } catch {
    status.textContent =
      'Clipboard unavailable. Select and copy the visible source, or download it.';
  }
};

function formatAddress(addr) {
  if (!addr || addr === zeroAddress) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatCadence(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '—';
  }
  if (Number(value) === 0) {
    return 'manual';
  }
  return `${value}s`;
}

function formatAutopilot(control = {}) {
  const enabled = Boolean(control.autopilotEnabled);
  const cadence = formatCadence(control.autopilotCadence);
  return `${enabled ? 'enabled' : 'standby'} @ ${cadence}`;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatList(values, fallback = '—') {
  if (!values || !values.length) {
    return fallback;
  }
  return values.join(', ');
}

function appendCredentialItem(list, heading, lines = []) {
  const li = document.createElement('li');
  const title = document.createElement('strong');
  title.textContent = heading;
  li.appendChild(title);
  lines
    .filter((line) => typeof line === 'string' && line.length)
    .forEach((line) => {
      const span = document.createElement('span');
      span.textContent = line;
      li.appendChild(span);
    });
  list.appendChild(li);
}

function heartbeatSummary(domain, global) {
  const cadence = Math.max(
    domain.heartbeatSeconds ?? 0,
    global.l2SyncCadence ?? 0
  );
  return `${cadence}s sync cadence (domain ${domain.heartbeatSeconds}s, global ${global.l2SyncCadence}s)`;
}

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
    domain.active !== false && domain.lifecycle !== 'sunset',
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

function formatBps(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${(value / 100).toFixed(2)}% (${value} bps)`;
}

function formatStake(value) {
  try {
    if (value === undefined || value === null) return '—';
    const big = typeof value === 'bigint' ? value : BigInt(value);
    return `${big.toString()} configured base units`;
  } catch (error) {
    return String(value ?? '—');
  }
}

function formatUSD(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '—';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '—';
  }
  if (numeric >= 1e12) {
    return `$${(numeric / 1e12).toFixed(2)}T`;
  }
  if (numeric >= 1e9) {
    return `$${(numeric / 1e9).toFixed(2)}B`;
  }
  if (numeric >= 1e6) {
    return `$${(numeric / 1e6).toFixed(2)}M`;
  }
  return `$${numeric.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function computeMetrics(config) {
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
    if (domain.telemetry) {
      const telemetry = domain.telemetry;
      const resilienceBps = Number(telemetry.resilienceBps ?? NaN);
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
    if (domain.metadata?.sentinel) {
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
  const computeCoverage = (breaches, floor) => {
    if (Number.isNaN(floor)) {
      return null;
    }
    if (!domainCount) {
      return 1;
    }
    return (domainCount - breaches) / domainCount;
  };
  return {
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
      resilienceFloor
    ),
    resilienceFloorBreaches,
    automationFloorCoverage: computeCoverage(
      automationFloorBreaches,
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

function renderGlobal(config) {
  const target = document.getElementById('global-summary');
  target.innerHTML = '';
  const telemetry = config.global.telemetry || {};
  const infra = config.global.infrastructure || {};
  const items = [
    `Global manifest: ${config.global.manifestURI}`,
    `IoT oracle router: ${formatAddress(config.global.iotOracleRouter)}`,
    `Default L2 gateway: ${formatAddress(config.global.defaultL2Gateway)}`,
    `Treasury bridge: ${formatAddress(config.global.treasuryBridge)}`,
    `DID registry: ${formatAddress(config.global.didRegistry)}`,
    `System pause: ${formatAddress(config.global.systemPause)}`,
    `Escalation bridge: ${formatAddress(config.global.escalationBridge)}`,
    `Network cadence baseline: ${config.global.l2SyncCadence}s`,
    `Mesh coordinator: ${formatAddress(infra.meshCoordinator)}`,
    `Data lake: ${formatAddress(infra.dataLake)}`,
    `Identity bridge: ${formatAddress(infra.identityBridge)}`,
    `Infra topology: ${infra.topologyURI ?? '—'}`,
    `Infra autopilot: ${formatAutopilot({
      autopilotEnabled: Number(infra.autopilotCadence ?? 0) > 0,
      autopilotCadence: infra.autopilotCadence,
    })}`,
    `Infra enforcement: ${
      infra.enforceDecentralizedInfra ? 'enforced' : 'advisory'
    }`,
    `Treasury buffer: ${formatBps(config.global.guards?.treasuryBufferBps)}`,
    `Circuit breaker: ${formatBps(config.global.guards?.circuitBreakerBps)}`,
    `Anomaly grace: ${config.global.guards?.anomalyGracePeriod ?? '—'}s`,
    `Auto-pause: ${String(config.global.guards?.autoPauseEnabled ?? false)}`,
    `Oversight council: ${formatAddress(
      config.global.guards?.oversightCouncil
    )}`,
    `Telemetry manifest hash: ${telemetry.manifestHash ?? '—'}`,
    `Telemetry metrics digest: ${telemetry.metricsDigest ?? '—'}`,
    `Telemetry resilience floor: ${formatBps(telemetry.resilienceFloorBps)}`,
    `Telemetry automation floor: ${formatBps(telemetry.automationFloorBps)}`,
    `Telemetry oversight weight: ${formatBps(telemetry.oversightWeightBps)}`,
  ];
  if (state.metrics) {
    const {
      averageResilience,
      minResilience,
      maxResilience,
      totalValueFlow,
      sentinelCount,
      averageAutomation,
      averageCompliance,
      averageLatency,
      l2Coverage,
      resilienceStdDev,
      resilienceFloorCoverage,
      resilienceFloorBreaches,
      automationFloorCoverage,
      automationFloorBreaches,
      credentialCoverage,
      credentialedDomains,
      credentialRequirements,
      globalCredentialAnchors,
      globalCredentialIssuers,
      globalCredentialPolicies,
      globalCredentialDomainCoverage,
      globalRevocationRegistry,
    } = state.metrics;
    if (averageResilience !== null) {
      items.push(
        `Model resilience: avg ${averageResilience.toFixed(
          3
        )} (min ${minResilience?.toFixed(3)}, max ${maxResilience?.toFixed(3)})`
      );
    }
    if (resilienceStdDev !== null) {
      items.push(`Resilience deviation: ±${resilienceStdDev.toFixed(4)}`);
    }
    if (averageAutomation !== null) {
      items.push(
        `Configured automation score: ${formatBps(averageAutomation)}`
      );
    }
    if (averageCompliance !== null) {
      items.push(
        `Configured compliance score: ${formatBps(averageCompliance)}`
      );
    }
    if (averageLatency !== null) {
      items.push(
        `Assumed average settlement latency: ${averageLatency.toFixed(1)}s`
      );
    }
    items.push(
      `L2 settlement coverage: ${(l2Coverage * 100).toFixed(1)}% of domains`
    );
    if (totalValueFlow) {
      items.push(
        `Illustrative monthly value flow: ${formatUSD(totalValueFlow)}`
      );
    }
    items.push(`Declared sentinels: ${sentinelCount}`);
    if (resilienceFloorCoverage !== null) {
      items.push(
        `Resilience floor coverage: ${(resilienceFloorCoverage * 100).toFixed(
          1
        )}% (breaches ${resilienceFloorBreaches})`
      );
    }
    if (automationFloorCoverage !== null) {
      items.push(
        `Automation floor coverage: ${(automationFloorCoverage * 100).toFixed(
          1
        )}% (breaches ${automationFloorBreaches})`
      );
    }
    if (config.domains.length) {
      items.push(
        `Autopilot coverage: ${(
          (state.metrics.autopilotEnabled / config.domains.length) *
          100
        ).toFixed(1)}% (${state.metrics.autopilotEnabled}/${
          config.domains.length
        } domains)`
      );
    }
    items.push(
      `Credential coverage: ${(credentialCoverage * 100).toFixed(
        1
      )}% (${credentialedDomains}/${
        config.domains.length
      } domains, ${credentialRequirements} requirements)`
    );
    items.push(
      `Trust anchors: ${globalCredentialAnchors} | issuers: ${globalCredentialIssuers} | policies: ${globalCredentialPolicies}`
    );
    items.push(
      `Issuer footprint: ${globalCredentialDomainCoverage} domains | Revocation registry: ${
        globalRevocationRegistry ?? '—'
      }`
    );
  }
  items.forEach((text) => {
    const span = document.createElement('span');
    span.textContent = `• ${text}`;
    target.appendChild(span);
  });
}

function renderCredentialGovernance(config) {
  const summary = document.getElementById('credential-summary');
  const grid = document.getElementById('credential-grid');
  summary.innerHTML = '';
  grid.innerHTML = '';

  const metrics = state.metrics || {};
  const coverage = Number(metrics.credentialCoverage ?? 0);
  const credentialedDomains = Number(metrics.credentialedDomains ?? 0);
  const requirements = Number(metrics.credentialRequirements ?? 0);
  const trustAnchorsCount = Number(metrics.globalCredentialAnchors ?? 0);
  const issuerCount = Number(metrics.globalCredentialIssuers ?? 0);
  const policyCount = Number(metrics.globalCredentialPolicies ?? 0);
  const issuerFootprint = Number(metrics.globalCredentialDomainCoverage ?? 0);
  const configDomainCount = config.domains.length || 0;
  const globalCredentials = config.global.credentials || {};
  const revocationRegistry =
    metrics.globalRevocationRegistry ??
    globalCredentials.revocationRegistry ??
    '—';
  const summaryItems = [
    `Global coverage: ${(coverage * 100).toFixed(
      1
    )}% (${credentialedDomains}/${configDomainCount} domains)`,
    `Credential safeguards: ${requirements} total requirements`,
    `Trust anchors: ${trustAnchorsCount} | issuers: ${issuerCount} | policies: ${policyCount}`,
    `Issuer footprint: ${issuerFootprint} domains`,
    `Revocation registry: ${revocationRegistry}`,
  ];
  summaryItems.forEach((text) => {
    const span = document.createElement('span');
    span.textContent = `• ${text}`;
    summary.appendChild(span);
  });

  const trustAnchors = ensureArray(globalCredentials.trustAnchors);
  const issuers = ensureArray(globalCredentials.issuers);
  const policies = ensureArray(globalCredentials.policies);

  const globalCard = document.createElement('div');
  globalCard.className = 'domain-card';
  const globalHeading = document.createElement('h3');
  globalHeading.textContent = 'Global credential control';
  globalCard.appendChild(globalHeading);

  const globalMetrics = document.createElement('div');
  globalMetrics.className = 'metrics';
  globalMetrics.innerHTML = html`
    <span>Trust anchors: ${trustAnchors.length}</span>
    <span>Issuers: ${issuers.length}</span>
    <span>Policies: ${policies.length}</span>
    <span>Issuer footprint: ${issuerFootprint} domains</span>
    <span>Revocation registry: ${revocationRegistry}</span>
  `;
  globalCard.appendChild(globalMetrics);

  const anchorList = document.createElement('ul');
  anchorList.className = 'mesh-list credential-list';
  if (trustAnchors.length) {
    trustAnchors.forEach((anchor, idx) => {
      appendCredentialItem(anchorList, `[Anchor ${idx + 1}] ${anchor.name}`, [
        `DID: ${anchor.did}`,
        anchor.role ? `Role: ${anchor.role}` : '',
        anchor.policyURI ? `Policy: ${anchor.policyURI}` : '',
      ]);
    });
  } else {
    appendCredentialItem(anchorList, 'Trust anchors pending', [
      'Define global oversight issuers to unlock credential automation.',
    ]);
  }
  globalCard.appendChild(anchorList);

  const issuerList = document.createElement('ul');
  issuerList.className = 'mesh-list credential-list';
  if (issuers.length) {
    issuers.forEach((issuer, idx) => {
      appendCredentialItem(issuerList, `[Issuer ${idx + 1}] ${issuer.name}`, [
        `DID: ${issuer.did}`,
        issuer.attestationType ? `Attestation: ${issuer.attestationType}` : '',
        issuer.registry ? `Registry: ${issuer.registry}` : '',
        issuer.domains?.length ? `Domains: ${formatList(issuer.domains)}` : '',
      ]);
    });
  } else {
    appendCredentialItem(issuerList, 'Issuers pending', [
      'Register credential issuers to activate cross-domain access control.',
    ]);
  }
  globalCard.appendChild(issuerList);

  const policyList = document.createElement('ul');
  policyList.className = 'mesh-list credential-list';
  if (policies.length) {
    policies.forEach((policy, idx) => {
      appendCredentialItem(policyList, `[Policy ${idx + 1}] ${policy.name}`, [
        policy.description || '',
        policy.uri ? `URI: ${policy.uri}` : '',
      ]);
    });
  } else {
    appendCredentialItem(policyList, 'Policies pending', [
      'Publish credential policies to guide human oversight enrollment.',
    ]);
  }
  globalCard.appendChild(policyList);
  grid.appendChild(globalCard);

  config.domains.forEach((domain) => {
    const domainCard = document.createElement('div');
    domainCard.className = 'domain-card';
    const heading = document.createElement('h3');
    heading.textContent = domain.name;
    domainCard.appendChild(heading);

    const domainCredentials = ensureArray(domain.credentials);
    const issuerSet = new Set();
    const verifierSet = new Set();
    const registrySet = new Set();
    domainCredentials.forEach((credential) => {
      ensureArray(credential.issuers).forEach((issuer) =>
        issuerSet.add(issuer)
      );
      ensureArray(credential.verifiers).forEach((verifier) =>
        verifierSet.add(verifier)
      );
      if (credential.registry) {
        registrySet.add(credential.registry);
      }
    });

    const domainMetrics = document.createElement('div');
    domainMetrics.className = 'metrics';
    domainMetrics.innerHTML = html`
      <span>Total requirements: ${domainCredentials.length}</span>
      <span>Issuers in scope: ${issuerSet.size}</span>
      <span>Verifiers declared: ${verifierSet.size}</span>
      <span>Registries referenced: ${registrySet.size}</span>
    `;
    domainCard.appendChild(domainMetrics);

    const credentialList = document.createElement('ul');
    credentialList.className = 'mesh-list credential-list';
    if (domainCredentials.length) {
      domainCredentials.forEach((credential, idx) => {
        appendCredentialItem(
          credentialList,
          `[${idx + 1}] ${credential.name}`,
          [
            credential.requirement,
            credential.credentialType
              ? `Type: ${credential.credentialType}`
              : '',
            credential.format ? `Format: ${credential.format}` : '',
            credential.issuers?.length
              ? `Issuers: ${formatList(credential.issuers)}`
              : '',
            credential.verifiers?.length
              ? `Verifiers: ${formatList(credential.verifiers)}`
              : '',
            credential.registry ? `Registry: ${credential.registry}` : '',
            credential.evidence ? `Evidence: ${credential.evidence}` : '',
            credential.notes ? `Notes: ${credential.notes}` : '',
          ]
        );
      });
    } else {
      appendCredentialItem(credentialList, 'Credential plan pending', [
        'Define verifiable credential guard rails before enabling autonomous operations.',
      ]);
    }
    domainCard.appendChild(credentialList);
    grid.appendChild(domainCard);
  });
}

function renderDomains(config) {
  const grid = document.getElementById('domain-grid');
  grid.innerHTML = '';
  config.domains.forEach((domain) => {
    const card = document.createElement('article');
    card.className = 'domain-card';

    const title = document.createElement('h3');
    title.textContent = domain.name;
    card.appendChild(title);

    const slug = document.createElement('span');
    slug.className = 'badge';
    slug.textContent = `slug: ${domain.slug}`;
    card.appendChild(slug);

    const priority = document.createElement('span');
    priority.className = 'badge';
    priority.textContent = `priority ${domain.priority}`;
    card.appendChild(priority);

    const metrics = document.createElement('div');
    metrics.className = 'metrics';
    const metadata = domain.metadata || {};
    const telemetry = domain.telemetry || {};
    const control = domain.infrastructureControl || {};
    const resilience =
      metadata.resilienceIndex !== undefined
        ? Number(metadata.resilienceIndex).toFixed(3)
        : '—';
    metrics.innerHTML = html`
      <span>Manifest URI: ${domain.manifestURI}</span>
      <span>Subgraph: ${domain.subgraph}</span>
      <span>Validation module: ${formatAddress(domain.validationModule)}</span>
      <span>IoT oracle: ${formatAddress(domain.oracle)}</span>
      <span>Execution router: ${formatAddress(domain.executionRouter)}</span>
      <span>Heartbeat: ${heartbeatSummary(domain, config.global)}</span>
      <span>Skill tags: ${domain.skillTags.join(', ')}</span>
      <span>Resilience index: ${resilience}</span>
      <span
        >Illustrative monthly value flow:
        ${metadata.valueFlowDisplay ??
        formatUSD(metadata.valueFlowMonthlyUSD)}</span
      >
      <span>Domain sentinel: ${metadata.sentinel ?? '—'}</span>
      <span>Sentinel oracle: ${formatAddress(telemetry.sentinelOracle)}</span>
      <span>Declared uptime: ${metadata.uptime ?? '—'}</span>
      <span>Max active jobs: ${domain.operations?.maxActiveJobs ?? '—'}</span>
      <span>Queue depth: ${domain.operations?.maxQueueDepth ?? '—'}</span>
      <span>Min stake: ${formatStake(domain.operations?.minStake)}</span>
      <span
        >Treasury share: ${formatBps(domain.operations?.treasuryShareBps)}</span
      >
      <span
        >Circuit breaker:
        ${formatBps(domain.operations?.circuitBreakerBps)}</span
      >
      <span
        >Requires human validation:
        ${domain.operations?.requiresHumanValidation ? 'Yes' : 'No'}</span
      >
      <span>Telemetry resilience: ${formatBps(telemetry.resilienceBps)}</span>
      <span>Telemetry automation: ${formatBps(telemetry.automationBps)}</span>
      <span>Telemetry compliance: ${formatBps(telemetry.complianceBps)}</span>
      <span
        >Settlement latency: ${telemetry.settlementLatencySeconds ?? '—'}s (L2
        ${telemetry.usesL2Settlement ? 'enabled' : 'disabled'})</span
      >
      <span>Telemetry metrics digest: ${telemetry.metricsDigest ?? '—'}</span>
      <span>Telemetry manifest hash: ${telemetry.manifestHash ?? '—'}</span>
      <span>Agent ops coordinator: ${formatAddress(control.agentOps)}</span>
      <span>Data pipeline: ${formatAddress(control.dataPipeline)}</span>
      <span
        >Credential verifier: ${formatAddress(control.credentialVerifier)}</span
      >
      <span>Fallback operator: ${formatAddress(control.fallbackOperator)}</span>
      <span>Control plane URI: ${control.controlPlaneURI ?? '—'}</span>
      <span>Autopilot posture: ${formatAutopilot(control)}</span>
    `;
    card.appendChild(metrics);

    const credentialList = document.createElement('ul');
    credentialList.className = 'mesh-list credential-list';
    const domainCredentials = ensureArray(domain.credentials);
    if (domainCredentials.length) {
      domainCredentials.forEach((credential, idx) => {
        appendCredentialItem(
          credentialList,
          `[${idx + 1}] ${credential.name}`,
          [
            credential.requirement,
            credential.issuers?.length
              ? `Issuers: ${formatList(credential.issuers)}`
              : '',
            credential.verifiers?.length
              ? `Verifiers: ${formatList(credential.verifiers)}`
              : '',
            credential.registry ? `Registry: ${credential.registry}` : '',
          ]
        );
      });
    } else {
      appendCredentialItem(credentialList, 'Credential guard rails', [
        'No verifiable credentials configured yet — follow governance checklist before launch.',
      ]);
    }
    card.appendChild(credentialList);
    grid.appendChild(card);
  });
}

function renderBridgePlans(config) {
  const grid = document.getElementById('bridge-grid');
  grid.innerHTML = '';
  config.domains.forEach((domain) => {
    const div = document.createElement('div');
    div.className = 'domain-card';
    const metadata = domain.metadata || {};
    const telemetry = domain.telemetry || {};
    const control = domain.infrastructureControl || {};
    const bridge = {
      domain: domain.slug,
      l2Gateway: domain.l2Gateway || config.global.defaultL2Gateway,
      oracle: domain.oracle || config.global.iotOracleRouter,
      executionRouter: domain.executionRouter || zeroAddress,
      validationModule: domain.validationModule || zeroAddress,
      cadence: heartbeatSummary(domain, config.global),
      sentinel: metadata.sentinel || '—',
      resilience:
        metadata.resilienceIndex !== undefined
          ? Number(metadata.resilienceIndex).toFixed(3)
          : '—',
      telemetryResilience: telemetry.resilienceBps ?? null,
      telemetryAutomation: telemetry.automationBps ?? null,
      telemetryCompliance: telemetry.complianceBps ?? null,
      settlementLatency: telemetry.settlementLatencySeconds ?? null,
      usesL2: telemetry.usesL2Settlement ?? false,
      autopilot: formatAutopilot(control),
      controlPlane: control.controlPlaneURI ?? '—',
      agentOps: formatAddress(control.agentOps),
    };
    div.innerHTML = html`
      <h3>${domain.name}</h3>
      <div class="metrics">
        <span>Target L2 gateway: ${formatAddress(bridge.l2Gateway)}</span>
        <span>IoT oracle router: ${formatAddress(bridge.oracle)}</span>
        <span>Execution router: ${formatAddress(bridge.executionRouter)}</span>
        <span
          >Validation module: ${formatAddress(bridge.validationModule)}</span
        >
        <span>${bridge.cadence}</span>
        <span>Resilience index: ${bridge.resilience}</span>
        <span>Sentinel coverage: ${bridge.sentinel}</span>
        <span>Max active jobs: ${domain.operations?.maxActiveJobs ?? '—'}</span>
        <span>Min stake: ${formatStake(domain.operations?.minStake)}</span>
        <span
          >Treasury share:
          ${formatBps(domain.operations?.treasuryShareBps)}</span
        >
        <span
          >Telemetry resilience:
          ${bridge.telemetryResilience !== null
            ? formatBps(Number(bridge.telemetryResilience))
            : '—'}</span
        >
        <span
          >Telemetry automation:
          ${bridge.telemetryAutomation !== null
            ? formatBps(Number(bridge.telemetryAutomation))
            : '—'}</span
        >
        <span
          >Telemetry compliance:
          ${bridge.telemetryCompliance !== null
            ? formatBps(Number(bridge.telemetryCompliance))
            : '—'}</span
        >
        <span
          >Settlement latency: ${bridge.settlementLatency ?? '—'}s (L2
          ${bridge.usesL2 ? 'enabled' : 'disabled'})</span
        >
        <span>Agent ops coordinator: ${bridge.agentOps}</span>
        <span>Control plane: ${bridge.controlPlane}</span>
        <span>Autopilot posture: ${bridge.autopilot}</span>
      </div>
    `;
    grid.appendChild(div);
  });
}

function renderCalldata() {
  const grid = document.getElementById('calldata-grid');
  grid.innerHTML = '';
  state.calldata.forEach((entry) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'domain-card';
    const title = document.createElement('h3');
    title.textContent = entry.label;
    wrapper.appendChild(title);
    const pre = document.createElement('pre');
    pre.textContent = entry.data;
    pre.tabIndex = 0;
    pre.setAttribute('aria-label', entry.label + ' unsigned calldata');
    wrapper.appendChild(pre);
    grid.appendChild(wrapper);
  });
}

function buildCalldata(config) {
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
  calldata.push({
    label: 'setGlobalGuards(GlobalGuards)',
    data: iface.encodeFunctionData('setGlobalGuards', [guardTuple]),
  });
  calldata.push({
    label: 'setGlobalTelemetry(GlobalTelemetry)',
    data: iface.encodeFunctionData('setGlobalTelemetry', [telemetryTuple]),
  });
  if (infrastructureTuple) {
    calldata.push({
      label: 'setGlobalInfrastructure(GlobalInfrastructure)',
      data: iface.encodeFunctionData('setGlobalInfrastructure', [
        infrastructureTuple,
      ]),
    });
  }
  if (config.global.systemPause && config.global.systemPause !== zeroAddress) {
    calldata.push({
      label: 'setSystemPause(address)',
      data: iface.encodeFunctionData('setSystemPause', [
        config.global.systemPause,
      ]),
    });
  }
  if (
    config.global.escalationBridge &&
    config.global.escalationBridge !== zeroAddress
  ) {
    calldata.push({
      label: 'setEscalationBridge(address)',
      data: iface.encodeFunctionData('setEscalationBridge', [
        config.global.escalationBridge,
      ]),
    });
  }
  config.domains.forEach((domain) => {
    const tuple = buildDomainTuple(domain);
    const domainId = keccak256(toUtf8Bytes(domain.slug.toLowerCase()));
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
    calldata.push({
      label: `setDomainOperations(${domain.slug})`,
      data: iface.encodeFunctionData('setDomainOperations', [
        domainId,
        opsTuple,
      ]),
    });
    calldata.push({
      label: `setDomainTelemetry(${domain.slug})`,
      data: iface.encodeFunctionData('setDomainTelemetry', [
        domainId,
        telemetryTupleDomain,
      ]),
    });
    calldata.push({
      label: `setDomainInfrastructure(${domain.slug})`,
      data: iface.encodeFunctionData('setDomainInfrastructure', [
        domainId,
        infraTuple,
      ]),
    });
  });
  state.calldata = calldata;
}

async function initialise() {
  resetPlanner();
  document.querySelector('#copy-mermaid').disabled = true;
  document.querySelector('#launch-demo').disabled = true;
  status.textContent = 'Loading the local configuration and ABI…';
  try {
    const [cfg, abi] = await Promise.all([
      json(configPath),
      json('./abi/Phase6ExpansionManager.json'),
    ]);
    if (!cfg.global || !Array.isArray(cfg.domains) || !cfg.domains.length)
      throw new Error(
        'Configuration must contain global settings and domains.'
      );
    validatePhase6Config(cfg);
    iface = new Interface(abi);
    // Encode before displaying a successful preview. Invalid ABI inputs fail the whole preview.
    buildCalldata(cfg);
    state.config = cfg;
    state.metrics = computeMetrics(cfg);
    renderGlobal(cfg);
    renderCredentialGovernance(cfg);
    renderDomains(cfg);
    renderBridgePlans(cfg);
    renderInfrastructure(cfg);
    renderCalldata();
    document.querySelector('#snapshot').hidden = false;
    initPlanner(cfg);
    await updateMermaid();
    status.textContent =
      cfg.domains.length +
      ' illustrative domains loaded. No worker, credential service, chain or oracle was contacted. Calldata is an unsigned example.';
    document.querySelector('#copy-mermaid').disabled = false;
  } catch (error) {
    state.config = null;
    state.calldata = [];
    document.querySelector('#snapshot').hidden = true;
    status.textContent =
      'Preview unavailable: ' +
      error.message +
      ' Serve the compiled site over HTTP and retry. The original map and source links remain available.';
  } finally {
    document.querySelector('#launch-demo').disabled = false;
  }
}

async function updateMermaid() {
  const lines = [
    'graph TD',
    '  Owner[[Governance]] --> Expansion(Phase6ExpansionManager)',
  ];
  state.config.domains.forEach((domain, index) => {
    // JSON quotes plus entity escaping keep configured names as literal diagram labels.
    const label = String(domain.name)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/[<>]/g, '');
    lines.push('  Expansion --> Domain' + index + '(["' + label + '"])');
    lines.push('  Domain' + index + ' --> RuntimePhase6');
  });
  lines.push('  RuntimePhase6[Phase6 Runtime] --> IoTSignal[IoT/Oracle Feeds]');
  lines.push('  RuntimePhase6 --> L2Fabric[Layer-2 Fabric]');
  lines.push('  L2Fabric --> Settlement');
  state.mermaidSource = lines.join('\n');
  const dynamic = document.querySelector('#mermaid-diagram');
  dynamic.textContent = state.mermaidSource;
  dynamic.removeAttribute('data-processed');
  document.querySelector('#dynamic-source').textContent = state.mermaidSource;
  try {
    await mermaid.run({
      nodes: [
        dynamic,
        ...(!document.querySelector('#mermaid-original svg')
          ? [document.querySelector('#mermaid-original')]
          : []),
      ],
    });
  } catch {
    document.querySelector('#diagram-status').textContent =
      'Diagram renderer unavailable. Both complete source maps are preserved below.';
  }
}

function renderInfrastructure(config) {
  const grid = document.getElementById('infra-grid');
  grid.innerHTML = '';

  const globalCard = document.createElement('div');
  globalCard.className = 'domain-card';
  const globalIntegrations = config.global.decentralizedInfra || [];
  const globalControl = config.global.infrastructure || {};
  globalCard.innerHTML = html`
    <h3>Global control mesh</h3>
    <div class="metrics">
      <span>Total integrations: ${globalIntegrations.length}</span>
      <span>Manifest anchor: ${config.global.manifestURI}</span>
      <span
        >Mesh coordinator: ${formatAddress(globalControl.meshCoordinator)}</span
      >
      <span>Data lake: ${formatAddress(globalControl.dataLake)}</span>
      <span
        >Identity bridge: ${formatAddress(globalControl.identityBridge)}</span
      >
      <span>Control plane: ${globalControl.topologyURI ?? '—'}</span>
      <span
        >Autopilot posture:
        ${formatAutopilot({
          autopilotEnabled: Number(globalControl.autopilotCadence ?? 0) > 0,
          autopilotCadence: globalControl.autopilotCadence,
        })}</span
      >
      <span
        >Infra enforcement:
        ${globalControl.enforceDecentralizedInfra
          ? 'enforced'
          : 'advisory'}</span
      >
    </div>
  `;
  const globalList = document.createElement('ul');
  globalList.className = 'mesh-list';
  globalIntegrations.forEach((entry, idx) => {
    const li = document.createElement('li');
    const endpoint = entry.endpoint ? ` → ${entry.endpoint}` : '';
    li.textContent = `[G${idx + 1}] ${entry.name} · ${
      entry.role
    } · declared status ${entry.status}${endpoint}`;
    globalList.appendChild(li);
  });
  globalCard.appendChild(globalList);
  grid.appendChild(globalCard);

  config.domains.forEach((domain) => {
    const card = document.createElement('div');
    card.className = 'domain-card';
    const control = domain.infrastructureControl || {};
    card.innerHTML = html`
      <h3>${domain.name}</h3>
      <div class="metrics">
        <span>Control plane: ${control.controlPlaneURI ?? '—'}</span>
        <span>Autopilot posture: ${formatAutopilot(control)}</span>
        <span>Agent ops: ${formatAddress(control.agentOps)}</span>
        <span>Data pipeline: ${formatAddress(control.dataPipeline)}</span>
        <span
          >Credential verifier:
          ${formatAddress(control.credentialVerifier)}</span
        >
        <span
          >Fallback operator: ${formatAddress(control.fallbackOperator)}</span
        >
      </div>
    `;
    const list = document.createElement('ul');
    list.className = 'mesh-list';
    domain.infrastructure.forEach((entry, idx) => {
      const endpoint = entry.endpoint || entry.uri;
      const meta = endpoint ? ` → ${endpoint}` : '';
      const item = document.createElement('li');
      item.textContent = `[${idx + 1}] ${entry.layer}: ${entry.name} · ${
        entry.role
      } · declared status ${entry.status}${meta}`;
      list.appendChild(item);
    });
    card.appendChild(list);
    grid.appendChild(card);
  });
}

document.querySelector('#launch-demo').addEventListener('click', initialise);
document
  .querySelector('#copy-mermaid')
  .addEventListener('click', () => copy(state.mermaidSource, 'Domain diagram'));
initialise();
