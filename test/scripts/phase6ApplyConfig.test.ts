import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  buildPlanSummary,
  domainIdFromSlug,
  fetchPhase6State,
  planPhase6Changes,
  Phase6Config,
  Phase6Plan,
} from '../../scripts/phase6/apply-config-lib';

async function deploy(name: string, ...args: unknown[]) {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

describe('Phase6 apply-config planner', function () {
  it('computes deterministic domain ids', function () {
    expect(domainIdFromSlug('finance')).to.equal(domainIdFromSlug('FINANCE'));
    expect(domainIdFromSlug('finance')).to.not.equal(domainIdFromSlug('health'));
  });

  it('plans registrations, updates and address changes', async function () {
    const [, governance, auxiliary] = await ethers.getSigners();
    const manager = await deploy('Phase6ExpansionManager', governance.address);
    const validation = await deploy('ValidationStub');
    const pause = await deploy('Phase6MockSystemPause');
    const escalation = await deploy('Phase6EscalationBridgeMock');
    const router = await deploy('Phase6MockSystemPause');
    const gateway = await deploy('Phase6MockSystemPause');
    const treasury = await deploy('Phase6MockSystemPause');
    const registry = await deploy('ValidationStub');

    const config: Phase6Config = {
      global: {
        manifestURI: 'ipfs://phase6/demo/global.json',
        iotOracleRouter: router.target as string,
        defaultL2Gateway: gateway.target as string,
        didRegistry: registry.target as string,
        treasuryBridge: treasury.target as string,
        l2SyncCadence: 180,
        systemPause: pause.target as string,
        escalationBridge: escalation.target as string,
        guards: {
          treasuryBufferBps: 400,
          circuitBreakerBps: 6400,
          anomalyGracePeriod: 180,
          autoPauseEnabled: true,
          oversightCouncil: pause.target as string,
        },
        decentralizedInfra: [
          {
            name: 'EigenLayer Risk Shield AVS',
            role: 'Cross-domain telemetry attestation',
            status: 'active',
            endpoint: 'https://mesh.test/avs',
          },
          {
            name: 'Filecoin Saturn Compute Mesh',
            role: 'Burst compute layer',
            status: 'ready',
            endpoint: 'https://mesh.test/compute',
          },
          {
            name: 'Arweave/IPFS Archive',
            role: 'Manifest anchoring',
            status: 'active',
            endpoint: 'ar://phase6/demo',
          },
        ],
        telemetry: {
          manifestHash: ethers.id('phase6-global-manifest'),
          metricsDigest: ethers.id('phase6-global-digest'),
          resilienceFloorBps: 9000,
          automationFloorBps: 8700,
          oversightWeightBps: 6400,
        },
      },
      domains: [
        {
          slug: 'finance',
          name: 'Finance Domain',
          manifestURI: 'ipfs://phase6/domains/finance.json',
          subgraph: 'https://phase6.example/subgraphs/finance',
          validationModule: validation.target as string,
          oracle: router.target as string,
          l2Gateway: gateway.target as string,
          executionRouter: validation.target as string,
          heartbeatSeconds: 120,
          active: true,
          operations: {
            maxActiveJobs: 48,
            maxQueueDepth: 240,
            minStake: ethers.parseEther('100').toString(),
            treasuryShareBps: 250,
            circuitBreakerBps: 7200,
            requiresHumanValidation: false,
          },
          telemetry: {
            resilienceBps: 9200,
            automationBps: 8800,
            complianceBps: 9100,
            settlementLatencySeconds: 45,
            usesL2Settlement: true,
            sentinelOracle: validation.target as string,
            settlementAsset: treasury.target as string,
            metricsDigest: ethers.id('finance-metrics'),
            manifestHash: ethers.id('finance-manifest'),
          },
          skillTags: ['finance', 'risk'],
          capabilities: {
            credit: 4.0,
            treasury: 3.5,
          },
          priority: 95,
          metadata: {
            domain: 'Capital markets synthesis',
            l2: 'Linea',
            sentinel: 'Resilience-Index-Finance',
            resilienceIndex: 0.982,
            uptime: '99.982%',
            valueFlowMonthlyUSD: 1_200_000_000,
            valueFlowDisplay: '$1.2B',
          },
          infrastructure: [
            {
              layer: 'Settlement',
              name: 'Ethereum Mainnet',
              role: 'Final settlement',
              status: 'anchor',
            },
            {
              layer: 'Layer-2',
              name: 'Linea',
              role: 'High-frequency execution',
              status: 'active',
              endpoint: 'https://linea.build',
            },
            {
              layer: 'Storage',
              name: 'Arweave',
              role: 'Portfolio manifests',
              status: 'active',
              endpoint: 'ar://phase6/finance',
            },
          ],
        },
      ],
    };

    const initialState = await fetchPhase6State(manager);
    const initialPlan = planPhase6Changes(initialState, config);
    expect(initialPlan.global?.diffs).to.include('manifestURI');
    expect(initialPlan.systemPause?.target).to.equal(pause.target);
    expect(initialPlan.escalationBridge?.target).to.equal(escalation.target);
    expect(initialPlan.domains).to.have.lengthOf(1);
    expect(initialPlan.domains[0].action).to.equal('registerDomain');
    expect(initialPlan.domainOperations).to.have.lengthOf(1);
    expect(initialPlan.globalGuards?.diffs).to.include('treasuryBufferBps');

    const managerGov = manager.connect(governance);
    await expect(managerGov.setGlobalConfig(initialPlan.global!.config)).to.emit(manager, 'GlobalConfigUpdated');
    await expect(managerGov.setSystemPause(pause.target)).to.emit(manager, 'SystemPauseUpdated');
    await expect(managerGov.setEscalationBridge(escalation.target)).to.emit(
      manager,
      'EscalationBridgeUpdated',
    );
    await expect(managerGov.registerDomain(initialPlan.domains[0].config)).to.emit(manager, 'DomainRegistered');
    await expect(managerGov.setGlobalGuards(initialPlan.globalGuards!.config)).to.emit(
      manager,
      'GlobalGuardsUpdated',
    );
    await expect(
      managerGov.setDomainOperations(
        initialPlan.domainOperations[0].id,
        initialPlan.domainOperations[0].config,
      ),
    ).to.emit(manager, 'DomainOperationsUpdated');

    const afterRegistration = await fetchPhase6State(manager);
    const postPlan = planPhase6Changes(afterRegistration, config);
    expect(postPlan.global).to.be.undefined;
    expect(postPlan.domains).to.be.empty;
    expect(postPlan.domainOperations).to.be.empty;

    const tweaked: Phase6Config = {
      ...config,
      domains: [
        {
          ...config.domains[0],
          heartbeatSeconds: 240,
          manifestURI: 'ipfs://phase6/domains/finance-v2.json',
          active: false,
          operations: {
            ...config.domains[0].operations!,
            maxActiveJobs: 64,
            requiresHumanValidation: true,
          },
        },
      ],
    };

    const updatedPlan = planPhase6Changes(afterRegistration, tweaked);
    expect(updatedPlan.domains).to.have.lengthOf(1);
    expect(updatedPlan.domains[0].diffs).to.include.members(['heartbeatSeconds', 'metadataURI', 'active']);
    expect(updatedPlan.domainOperations).to.have.lengthOf(1);
    expect(updatedPlan.domainOperations[0].diffs).to.include('maxActiveJobs');

    await expect(
      managerGov.updateDomain(updatedPlan.domains[0].id, updatedPlan.domains[0].config),
    ).to.emit(manager, 'DomainUpdated');
    await expect(
      managerGov.setDomainOperations(
        updatedPlan.domainOperations[0].id,
        updatedPlan.domainOperations[0].config,
      ),
    ).to.emit(manager, 'DomainOperationsUpdated');

    const finalState = await fetchPhase6State(manager);
    const finalPlan = planPhase6Changes(finalState, tweaked);
    expect(finalPlan.domains).to.be.empty;
    expect(finalPlan.domainOperations).to.be.empty;
    expect(finalPlan.global).to.be.undefined;
  });

  it('builds deterministic plan summaries for export', function () {
    const plan: Phase6Plan = {
      global: {
        action: 'setGlobalConfig',
        config: {
          iotOracleRouter: '0x1111111111111111111111111111111111111111',
          defaultL2Gateway: '0x2222222222222222222222222222222222222222',
          didRegistry: '0x3333333333333333333333333333333333333333',
          treasuryBridge: '0x4444444444444444444444444444444444444444',
          l2SyncCadence: 180n,
          manifestURI: 'ipfs://phase6/global.json',
        },
        diffs: ['manifestURI'],
      },
      systemPause: { action: 'setSystemPause', target: '0x5555555555555555555555555555555555555555' },
      escalationBridge: {
        action: 'setEscalationBridge',
        target: '0x6666666666666666666666666666666666666666',
      },
      domains: [
        {
          action: 'updateDomain',
          id: domainIdFromSlug('finance'),
          slug: 'finance',
          lifecycle: 'active',
          diffs: ['metadataURI'],
          config: {
            slug: 'finance',
            name: 'Finance Domain',
            metadataURI: 'ipfs://phase6/domains/finance.json',
            validationModule: '0x7777777777777777777777777777777777777777',
            dataOracle: '0x8888888888888888888888888888888888888888',
            l2Gateway: '0x9999999999999999999999999999999999999999',
            subgraphEndpoint: 'https://phase6.example/subgraphs/finance',
            executionRouter: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            heartbeatSeconds: 120n,
            active: true,
          },
        },
      ],
      domainOperations: [
        {
          action: 'setDomainOperations',
          id: domainIdFromSlug('finance'),
          slug: 'finance',
          diffs: ['minStake'],
          config: {
            maxActiveJobs: 100n,
            maxQueueDepth: 240n,
            minStake: 1234567890000000000n,
            treasuryShareBps: 280,
            circuitBreakerBps: 7200,
            requiresHumanValidation: false,
          },
        },
      ],
      globalGuards: {
        action: 'setGlobalGuards',
        config: {
          treasuryBufferBps: 400,
          circuitBreakerBps: 6400,
          anomalyGracePeriod: 180,
          autoPauseEnabled: true,
          oversightCouncil: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
        diffs: ['treasuryBufferBps'],
      },
      domainTelemetry: [
        {
          action: 'setDomainTelemetry',
          id: domainIdFromSlug('finance'),
          slug: 'finance',
          diffs: ['resilienceBps'],
          config: {
            resilienceBps: 9200,
            automationBps: 8800,
            complianceBps: 9100,
            settlementLatencySeconds: 42,
            usesL2Settlement: true,
            sentinelOracle: '0xcccccccccccccccccccccccccccccccccccccccc',
            settlementAsset: '0xdddddddddddddddddddddddddddddddddddddddd',
            metricsDigest: `0x${'1'.repeat(64)}`,
            manifestHash: `0x${'2'.repeat(64)}`,
          },
        },
      ],
      domainInfrastructure: [],
      globalTelemetry: {
        action: 'setGlobalTelemetry',
        config: {
          manifestHash: `0x${'3'.repeat(64)}`,
          metricsDigest: `0x${'4'.repeat(64)}`,
          resilienceFloorBps: 9300,
          automationFloorBps: 9050,
          oversightWeightBps: 7200,
        },
        diffs: ['manifestHash'],
      },
      warnings: ['review system pause escalation playbook'],
    };

    const summary = buildPlanSummary(plan, {
      manager: '0x1234567890123456789012345678901234567890',
      governance: '0x0987654321098765432109876543210987654321',
      specVersion: 'phase6.expansion.v2',
      network: { name: 'hardhat', chainId: 31337 },
      configPath: '/tmp/domains.json',
      dryRun: true,
      filters: {
        skipGlobal: false,
        skipSystemPause: false,
        skipEscalation: false,
        onlyDomains: ['finance'],
      },
    });

    expect(new Date(summary.generatedAt).getTime()).to.be.a('number');
    expect(summary.counts).to.deep.equal({
      global: 5,
      domains: 1,
      domainOperations: 1,
      domainTelemetry: 1,
      domainInfrastructure: 0,
      total: 8,
    });
    expect(summary.actions.domains[0].config.heartbeatSeconds).to.equal('120');
    expect(summary.actions.domainOperations[0].config.minStake).to.equal('1234567890000000000');
    expect(summary.actions.global?.config.l2SyncCadence).to.equal('180');
    expect(summary.actions.globalTelemetry?.config.resilienceFloorBps).to.equal(9300);
    expect(summary.actions.domains[0].lifecycle).to.equal('active');
    expect(summary.filters.onlyDomains).to.deep.equal(['finance']);
    expect(summary.warnings).to.deep.equal(['review system pause escalation playbook']);

    const filtered = buildPlanSummary(plan, {
      manager: '0x1234567890123456789012345678901234567890',
      governance: '0x0987654321098765432109876543210987654321',
      specVersion: 'phase6.expansion.v2',
      network: { name: 'hardhat', chainId: 31337 },
      configPath: '/tmp/domains.json',
      dryRun: false,
      filters: {
        skipGlobal: true,
        skipSystemPause: true,
        skipEscalation: true,
        onlyDomains: [],
      },
    });

    expect(filtered.actions.global).to.be.undefined;
    expect(filtered.actions.systemPause).to.be.undefined;
    expect(filtered.actions.escalationBridge).to.be.undefined;
    expect(filtered.counts.global).to.equal(2);
  });

  it('plans sunset removals without duplicate operations', async function () {
    const [, governance] = await ethers.getSigners();
    const manager = await deploy('Phase6ExpansionManager', governance.address);
    const validation = await deploy('ValidationStub');
    const pause = await deploy('Phase6MockSystemPause');
    const escalation = await deploy('Phase6EscalationBridgeMock');
    const router = await deploy('Phase6MockSystemPause');
    const gateway = await deploy('Phase6MockSystemPause');
    const treasury = await deploy('Phase6MockSystemPause');

    const baseConfig: Phase6Config = {
      global: {
        manifestURI: 'ipfs://phase6/demo/global.json',
        iotOracleRouter: router.target as string,
        defaultL2Gateway: gateway.target as string,
        didRegistry: validation.target as string,
        treasuryBridge: treasury.target as string,
        l2SyncCadence: 300,
        systemPause: pause.target as string,
        escalationBridge: escalation.target as string,
        guards: {
          treasuryBufferBps: 500,
          circuitBreakerBps: 7200,
          anomalyGracePeriod: 180,
          autoPauseEnabled: true,
          oversightCouncil: pause.target as string,
        },
        decentralizedInfra: [
          {
            name: 'EigenLayer Risk Shield AVS',
            role: 'Telemetry attestations',
            status: 'active',
            endpoint: 'https://mesh.test/avs',
          },
          {
            name: 'Filecoin Saturn Compute Mesh',
            role: 'Burst compute layer',
            status: 'ready',
            endpoint: 'https://mesh.test/compute',
          },
          {
            name: 'Arweave/IPFS Archive',
            role: 'Manifest anchoring',
            status: 'active',
            endpoint: 'ar://phase6/demo',
          },
        ],
        telemetry: {
          manifestHash: ethers.id('phase6-global-manifest'),
          metricsDigest: ethers.id('phase6-global-digest'),
          resilienceFloorBps: 9100,
          automationFloorBps: 8800,
          oversightWeightBps: 6600,
        },
      },
      domains: [
        {
          slug: 'logistics',
          name: 'Autonomous Supply Lattice',
          manifestURI: 'ipfs://phase6/domains/logistics.json',
          subgraph: 'https://phase6.example/subgraphs/logistics',
          validationModule: validation.target as string,
          oracle: router.target as string,
          l2Gateway: gateway.target as string,
          executionRouter: validation.target as string,
          heartbeatSeconds: 90,
          active: true,
          operations: {
            maxActiveJobs: 64,
            maxQueueDepth: 240,
            minStake: ethers.parseEther('250').toString(),
            treasuryShareBps: 240,
            circuitBreakerBps: 6400,
            requiresHumanValidation: false,
          },
          telemetry: {
            resilienceBps: 9400,
            automationBps: 9050,
            complianceBps: 9200,
            settlementLatencySeconds: 36,
            usesL2Settlement: true,
            sentinelOracle: validation.target as string,
            settlementAsset: treasury.target as string,
            metricsDigest: ethers.id('logistics-metrics'),
            manifestHash: ethers.id('logistics-manifest'),
          },
          skillTags: ['logistics', 'iot'],
          capabilities: {
            routing: 4.2,
            supply: 4.0,
          },
          priority: 88,
          metadata: {
            domain: 'Planetary logistics coordination',
            l2: 'Base',
            sentinel: 'Resilience-Index-Logistics',
            resilienceIndex: 0.964,
            uptime: '99.945%',
            valueFlowMonthlyUSD: 12500000000,
          },
          infrastructure: [
            {
              layer: 'Settlement',
              name: 'Ethereum Mainnet',
              role: 'Final settlement',
              status: 'anchor',
            },
            {
              layer: 'Layer-2',
              name: 'Base',
              role: 'IoT event batching',
              status: 'active',
              endpoint: 'https://base.org',
            },
            {
              layer: 'Oracle',
              name: 'Chainlink CCIP',
              role: 'Telemetry feeds',
              status: 'active',
              endpoint: 'https://chain.link',
            },
          ],
          infrastructureControl: {
            agentOps: router.target as string,
            dataPipeline: gateway.target as string,
            credentialVerifier: validation.target as string,
            fallbackOperator: treasury.target as string,
            controlPlaneURI: 'ipfs://phase6/domains/logistics/control.json',
            autopilotCadence: 300,
            autopilotEnabled: true,
          },
        },
      ],
    };

    const stateBefore = await fetchPhase6State(manager);
    const registrationPlan = planPhase6Changes(stateBefore, baseConfig);
    const managerGov = manager.connect(governance);
    await managerGov.setGlobalConfig(registrationPlan.global!.config);
    await managerGov.setSystemPause(baseConfig.global.systemPause!);
    await managerGov.setEscalationBridge(baseConfig.global.escalationBridge!);
    await managerGov.setGlobalGuards(registrationPlan.globalGuards!.config);
    if (registrationPlan.globalTelemetry) {
      await managerGov.setGlobalTelemetry(registrationPlan.globalTelemetry.config);
    }
    await managerGov.registerDomain(registrationPlan.domains[0].config!);
    await managerGov.setDomainOperations(
      registrationPlan.domainOperations[0].id,
      registrationPlan.domainOperations[0].config,
    );
    await managerGov.setDomainTelemetry(
      registrationPlan.domainTelemetry[0].id,
      registrationPlan.domainTelemetry[0].config,
    );
    await managerGov.setDomainInfrastructure(
      registrationPlan.domainInfrastructure[0].id,
      registrationPlan.domainInfrastructure[0].config,
    );

    const activeState = await fetchPhase6State(manager);

    const sunsetConfig: Phase6Config = {
      ...baseConfig,
      domains: [
        {
          ...baseConfig.domains[0],
          lifecycle: 'sunset',
          sunsetPlan: {
            reason: 'Logistics mesh merging into climate orchestration network',
            retirementBlock: 21370000,
            handoffDomains: ['finance', 'climate'],
            notes: 'Agents migrate post resilience confirmation',
          },
        },
      ],
    };

    const removalPlan = planPhase6Changes(activeState, sunsetConfig);
    expect(removalPlan.domains).to.have.lengthOf(1);
    const removal = removalPlan.domains[0];
    expect(removal.action).to.equal('removeDomain');
    expect(removal.lifecycle).to.equal('sunset');
    expect(removal.sunsetPlan).to.deep.equal(sunsetConfig.domains[0].sunsetPlan);
    expect(removalPlan.domainOperations).to.be.empty;
    expect(removalPlan.domainTelemetry).to.be.empty;
    expect(removalPlan.domainInfrastructure).to.be.empty;
    expect(removalPlan.warnings).to.be.empty;

    const managerAddress = await manager.getAddress();
    const specVersion = await manager.SPEC_VERSION();
    const network = await ethers.provider.getNetwork();
    const summary = buildPlanSummary(removalPlan, {
      manager: managerAddress,
      governance: governance.address,
      specVersion,
      network: { name: network.name ?? 'hardhat', chainId: Number(network.chainId) },
      configPath: 'sunset.json',
      dryRun: true,
      filters: {
        skipGlobal: false,
        skipSystemPause: false,
        skipEscalation: false,
        onlyDomains: [],
      },
    });

    expect(summary.actions.domains).to.have.lengthOf(1);
    expect(summary.actions.domains[0].action).to.equal('removeDomain');
    expect(summary.actions.domains[0].lifecycle).to.equal('sunset');
    expect(summary.actions.domains[0].sunsetPlan).to.deep.include({
      reason: sunsetConfig.domains[0].sunsetPlan!.reason,
    });
    expect(summary.counts.domains).to.equal(1);
    expect(summary.counts.domainOperations).to.equal(0);
    expect(summary.warnings).to.be.empty;
  });
});
