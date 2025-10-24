import { expect } from 'chai';
import { ethers } from 'hardhat';
import { domainIdFromSlug, fetchPhase6State, planPhase6Changes, Phase6Config } from '../../scripts/phase6/apply-config-lib';

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
});
