import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  domainIdFromSlug,
  fetchPhase6State,
  planPhase6Changes,
  Phase6Config,
  ZERO_ADDRESS,
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
      },
      domains: [
        {
          slug: 'finance',
          name: 'Finance Domain',
          manifestURI: 'ipfs://phase6/domains/finance.json',
          subgraph: 'https://phase6.example/subgraphs/finance',
          validationModule: validation.target as string,
          oracle: ZERO_ADDRESS,
          l2Gateway: ZERO_ADDRESS,
          executionRouter: ZERO_ADDRESS,
          heartbeatSeconds: 120,
          active: true,
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

    const managerGov = manager.connect(governance);
    await expect(managerGov.setGlobalConfig(initialPlan.global!.config)).to.emit(manager, 'GlobalConfigUpdated');
    await expect(managerGov.setSystemPause(pause.target)).to.emit(manager, 'SystemPauseUpdated');
    await expect(managerGov.setEscalationBridge(escalation.target)).to.emit(
      manager,
      'EscalationBridgeUpdated',
    );
    await expect(managerGov.registerDomain(initialPlan.domains[0].config)).to.emit(manager, 'DomainRegistered');

    const afterRegistration = await fetchPhase6State(manager);
    const postPlan = planPhase6Changes(afterRegistration, config);
    expect(postPlan.global).to.be.undefined;
    expect(postPlan.domains).to.be.empty;

    const tweaked: Phase6Config = {
      ...config,
      domains: [
        {
          ...config.domains[0],
          heartbeatSeconds: 240,
          manifestURI: 'ipfs://phase6/domains/finance-v2.json',
          active: false,
        },
      ],
    };

    const updatedPlan = planPhase6Changes(afterRegistration, tweaked);
    expect(updatedPlan.domains).to.have.lengthOf(1);
    expect(updatedPlan.domains[0].diffs).to.include.members(['heartbeatSeconds', 'metadataURI', 'active']);

    await expect(
      managerGov.updateDomain(updatedPlan.domains[0].id, updatedPlan.domains[0].config),
    ).to.emit(manager, 'DomainUpdated');

    const finalState = await fetchPhase6State(manager);
    const finalPlan = planPhase6Changes(finalState, tweaked);
    expect(finalPlan.domains).to.be.empty;
    expect(finalPlan.global).to.be.undefined;
  });
});
