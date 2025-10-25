import { expect } from 'chai';
import { keccak256, toUtf8Bytes } from 'ethers';

import {
  buildPhase6Blueprint,
  loadPhase6Config,
} from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-blueprint';

const CONFIG_PATH = 'demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json';

describe('Phase 6 blueprint generator', function () {
  it('produces aggregate metrics and global calldata', function () {
    const config = loadPhase6Config(CONFIG_PATH);
    const blueprint = buildPhase6Blueprint(config, { configPath: CONFIG_PATH });

    expect(blueprint.metrics.domainCount).to.equal(config.domains.length);
    expect(blueprint.calldata.globalConfig).to.match(/^0x[0-9a-fA-F]+$/);
    expect(blueprint.fragments).to.include(
      'function setGlobalConfig((address,address,address,address,uint64,string) config)',
    );
    expect(blueprint.configPath).to.equal(CONFIG_PATH);
    expect(blueprint.mermaid).to.contain('Phase6ExpansionManager');
    expect(blueprint.metrics.resilienceStdDev).to.be.a('number');
    expect(blueprint.metrics.resilienceFloorBreaches).to.equal(0);
    expect(blueprint.metrics.resilienceFloorCoverage).to.equal(1);
    expect(blueprint.metrics.automationFloorBreaches).to.equal(2);
    expect(blueprint.metrics.automationFloorCoverage).to.be.closeTo(0.6, 0.0001);
    expect(blueprint.metrics.credentialedDomainCount).to.equal(config.domains.length);
    expect(blueprint.metrics.credentialRequirementCount).to.equal(
      config.domains.reduce((acc, domain) => acc + (domain.credentials?.length ?? 0), 0),
    );
    expect(blueprint.metrics.credentialCoverage).to.equal(1);
  });

  it('normalises domains and exposes deterministic ids', function () {
    const config = loadPhase6Config(CONFIG_PATH);
    const blueprint = buildPhase6Blueprint(config);
    const finance = blueprint.domains.find((domain) => domain.slug === 'finance');

    expect(finance).to.not.equal(undefined);
    expect(finance!.domainId).to.equal(keccak256(toUtf8Bytes('finance')));
    expect(finance!.operations.minStakeWei).to.match(/^[0-9]+$/);
    expect(finance!.operations.minStakeEth).to.match(/ETH$/);
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
