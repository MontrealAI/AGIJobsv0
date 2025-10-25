import { expect } from 'chai';

import {
  buildPhase6Blueprint,
  loadPhase6Config,
} from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-blueprint';
import { createDidAuditReport } from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-did-audit';

const CONFIG_PATH = 'demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json';

describe('Phase 6 DID audit', function () {
  it('summarises global credential coverage and domain findings', function () {
    const config = loadPhase6Config(CONFIG_PATH);
    const blueprint = buildPhase6Blueprint(config, { configPath: CONFIG_PATH });
    const report = createDidAuditReport(blueprint);

    expect(report.coverage).to.equal(blueprint.metrics.credentialCoverage);
    expect(report.credentialedDomains).to.equal(blueprint.metrics.credentialedDomainCount);
    expect(report.totalDomains).to.equal(config.domains.length);
    expect(report.totalRequirements).to.equal(blueprint.metrics.credentialRequirementCount);
    expect(report.globalTrustAnchors).to.equal(blueprint.credentials.global.trustAnchors.length);
    expect(report.globalIssuers).to.equal(blueprint.credentials.global.issuers.length);
    expect(report.globalPolicies).to.equal(blueprint.credentials.global.policies.length);
    expect(report.domainFindings).to.have.length(blueprint.domains.length);
    report.domainFindings.forEach((finding) => {
      expect(finding.slug).to.be.a('string').and.not.empty;
      expect(finding.credentials.length).to.be.greaterThan(0);
      expect(finding.gaps).to.deep.equal([]);
    });
    expect(report.missingDomains).to.deep.equal([]);
  });
});
