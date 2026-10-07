import { expect } from 'chai';
import { Interface, keccak256, toUtf8Bytes } from 'ethers';
import { createPhase6Runbook } from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-runbook';

import {
  buildPhase6Blueprint,
  loadPhase6Config,
} from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-blueprint';

const CONFIG_PATH =
  'demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json';

describe('Phase 6 blueprint generator', function () {
  it('produces aggregate metrics and global calldata', function () {
    const config = loadPhase6Config(CONFIG_PATH);
    const blueprint = buildPhase6Blueprint(config, { configPath: CONFIG_PATH });

    expect(blueprint.metrics.domainCount).to.equal(config.domains.length);
    expect(blueprint.calldata.globalConfig).to.match(/^0x[0-9a-fA-F]+$/);
    expect(blueprint.fragments).to.include(
      'function setGlobalConfig((address,address,address,address,uint64,string) config)'
    );
    expect(blueprint.configPath).to.equal(CONFIG_PATH);
    expect(blueprint.mermaid).to.contain('Phase6ExpansionManager');
    expect(blueprint.metrics.resilienceStdDev).to.be.a('number');
    expect(blueprint.metrics.resilienceFloorBreaches).to.equal(0);
    expect(blueprint.metrics.resilienceFloorCoverage).to.equal(1);
    expect(blueprint.metrics.automationFloorBreaches).to.equal(2);
    expect(blueprint.metrics.automationFloorCoverage).to.be.closeTo(
      0.6,
      0.0001
    );
    expect(blueprint.metrics.credentialedDomainCount).to.equal(
      config.domains.length
    );
    expect(blueprint.metrics.credentialRequirementCount).to.equal(
      config.domains.reduce(
        (acc, domain) => acc + (domain.credentials?.length ?? 0),
        0
      )
    );
    expect(blueprint.metrics.credentialCoverage).to.equal(1);
  });

  it('normalises domains and exposes deterministic ids', function () {
    const config = loadPhase6Config(CONFIG_PATH);
    const blueprint = buildPhase6Blueprint(config);
    const finance = blueprint.domains.find(
      (domain) => domain.slug === 'finance'
    );

    expect(finance).to.not.equal(undefined);
    expect(finance!.domainId).to.equal(keccak256(toUtf8Bytes('finance')));
    expect(finance!.operations.minStakeWei).to.match(/^[0-9]+$/);
    expect(finance!.operations.minStakeDisplay).to.include('base units');
    expect(finance!.operations.minStakeDisplay).not.to.include('ETH');
    expect(finance!.calldata.registerDomain).to.match(/^0x[0-9a-fA-F]+$/);
    expect(finance!.telemetry.metricsDigest).to.match(/^0x[0-9a-fA-F]{64}$/);
  });

  it('computes value flow and sentinel coverage totals', function () {
    const config = loadPhase6Config(CONFIG_PATH);
    const blueprint = buildPhase6Blueprint(config);

    const expectedValue = config.domains.reduce((acc, domain) => {
      const value = domain.metadata?.valueFlowMonthlyUSD ?? 0;
      return acc + Number(value);
    }, 0);

    expect(blueprint.metrics.totalValueFlowUSD).to.equal(expectedValue);
    expect(blueprint.metrics.sentinelFamilies).to.be.greaterThan(0);
  });
});

describe('Phase 6 operator runbook and lifecycle intent', function () {
  it('prints only configured optional global calldata in the generated runbook', function () {
    const full = buildPhase6Blueprint(loadPhase6Config(CONFIG_PATH));
    const fullRunbook = createPhase6Runbook(full);
    expect(fullRunbook).to.include(
      `setGlobalGuards: ${full.calldata.globalGuards}`
    );
    expect(fullRunbook).to.include(
      `setGlobalTelemetry: ${full.calldata.globalTelemetry}`
    );
    const minimal = loadPhase6Config(CONFIG_PATH);
    delete minimal.global.guards;
    delete minimal.global.telemetry;
    delete minimal.global.infrastructure;
    delete minimal.global.systemPause;
    delete minimal.global.escalationBridge;
    const blueprint = buildPhase6Blueprint(minimal);
    const runbook = createPhase6Runbook(blueprint);
    expect(runbook).to.include(
      `setGlobalConfig: ${blueprint.calldata.globalConfig}`
    );
    for (const method of [
      'setGlobalGuards',
      'setGlobalTelemetry',
      'setGlobalInfrastructure',
      'setSystemPause',
      'setEscalationBridge',
    ]) {
      expect(runbook).not.to.match(new RegExp(`^${method}:`, 'm'));
    }
    expect(runbook).not.to.include('undefined');
    expect(runbook).to.include('**Global Guard Rails**: Unconfigured');
    expect(runbook).to.include('**Global Infrastructure**: Unconfigured');
    expect(runbook).to.include('**Global Telemetry**: Unconfigured');
    expect(runbook).not.to.include('Auto Pause Enabled: No');
    expect(runbook).not.to.include('Treasury Buffer: 0.00%');
    expect(runbook).not.to.include('Infra Autopilot: manual');
    for (const domain of minimal.domains) {
      delete domain.operations;
      delete domain.telemetry;
      delete domain.infrastructureControl;
      delete domain.credentials;
    }
    const missingDomainRunbook = createPhase6Runbook(
      buildPhase6Blueprint(minimal)
    );
    expect(missingDomainRunbook).to.include('**Settlement**: Unconfigured');
    expect(missingDomainRunbook).to.include('**Operations**: Unconfigured');
    expect(missingDomainRunbook).to.include('**Control Plane**: Unconfigured');
    expect(missingDomainRunbook).to.include('**Credentials**: Unconfigured');
    expect(missingDomainRunbook).to.include(
      '**Requires Human Validation**: Unspecified'
    );
    expect(missingDomainRunbook).not.to.include('Mainnet anchored');
    expect(missingDomainRunbook).not.to.include('latency 0s');
    expect(missingDomainRunbook).not.to.include(
      '**Requires Human Validation**: No'
    );
    expect(missingDomainRunbook).not.to.include('None required');
    expect(missingDomainRunbook).not.to.include('undefined');
  });

  it('keeps experimental domains inactive in both registration and update proposals', function () {
    for (const requestedActive of [true, false, undefined]) {
      const config = loadPhase6Config(CONFIG_PATH);
      const domain = config.domains[0];
      domain.lifecycle = 'experimental';
      if (requestedActive === undefined) delete domain.active;
      else domain.active = requestedActive;
      const blueprint = buildPhase6Blueprint(config);
      const encoded = blueprint.domains[0];
      const iface = new Interface(blueprint.fragments);
      expect(encoded.active).to.equal(false);
      expect(
        iface.decodeFunctionData(
          'registerDomain',
          encoded.calldata.registerDomain!
        )[0].active
      ).to.equal(false);
      expect(
        iface.decodeFunctionData(
          'updateDomain',
          encoded.calldata.updateDomain!
        )[1].active
      ).to.equal(false);
    }
  });
});
