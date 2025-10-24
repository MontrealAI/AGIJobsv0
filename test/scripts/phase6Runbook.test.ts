import { expect } from 'chai';

import { buildPhase6Blueprint, loadPhase6Config } from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-blueprint';
import { createPhase6Runbook } from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-runbook';

const CONFIG_PATH = 'demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json';

describe('Phase 6 runbook generator', function () {
  it('renders executive summary, mermaid diagram, and domain payloads', function () {
    const config = loadPhase6Config(CONFIG_PATH);
    const blueprint = buildPhase6Blueprint(config, { configPath: CONFIG_PATH });
    const markdown = createPhase6Runbook(blueprint);

    expect(markdown).to.contain('# Phase 6 Expansion Runbook');
    expect(markdown).to.contain('```mermaid');
    expect(markdown).to.contain('Phase6ExpansionManager');
    expect(markdown).to.contain('## Domain: Sovereign Finance Hypergrid');
    expect(markdown).to.contain('setGlobalConfig');
    expect(markdown).to.contain('registerDomain: 0x');
  });
});
