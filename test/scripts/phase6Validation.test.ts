import { expect } from 'chai';
import { Interface } from 'ethers';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parsePhase6Json,
  validatePhase6Config,
} from '../../scripts/phase6/config-validation';
import {
  domainIdFromSlug,
  fetchPhase6State,
  planPhase6Changes,
} from '../../scripts/phase6/apply-config-lib';
import {
  buildPhase6Blueprint,
  loadPhase6Config,
  ABI_FRAGMENTS,
} from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-blueprint';
import { parsePhase6Args } from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-cli';
import {
  evaluateEvents,
  EventPayload,
} from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-iot-simulator';
import { createDidAuditReport } from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-did-audit';

const configPath =
  'demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json';
const fresh = (): any => loadPhase6Config(configPath);
const abi = new Interface(ABI_FRAGMENTS);
const sample = (): EventPayload => ({
  id: 'task-1',
  summary: 'Synthetic logistics routing review',
  type: 'iot.logistics.test',
  severity: 'low',
  domainHint: 'logistics',
  requiredSkills: ['routing'],
  requiredCapabilities: { routing: 3 },
});

describe('Phase 6 strict configuration and evidence boundaries', function () {
  for (const [label, mutate] of [
    [
      'unknown credential section field',
      (c: any) => {
        c.global.credentials.revocationRegsitry = 'did:example:wrong';
      },
    ],
    [
      'unknown trust anchor field',
      (c: any) => {
        c.global.credentials.trustAnchors[0].policyURL = 'ipfs://ignored';
      },
    ],
    [
      'unknown credential issuer field',
      (c: any) => {
        c.global.credentials.issuers[0].domainz = ['finance'];
      },
    ],
    [
      'unknown credential policy field',
      (c: any) => {
        c.global.credentials.policies[0].policyURI = 'ipfs://ignored';
      },
    ],
    [
      'unknown domain credential field',
      (c: any) => {
        c.domains[0].credentials[0].verifer = ['did:example:ignored'];
      },
    ],
    [
      'zero pause target',
      (c: any) => {
        c.global.systemPause = '0x' + '0'.repeat(40);
      },
    ],
    [
      'unknown active flag',
      (c: any) => {
        c.domains[0].activee = false;
      },
    ],
    [
      'unknown review flag',
      (c: any) => {
        c.domains[0].operations.requiresHumanValidaton = true;
      },
    ],
    [
      'unknown global guard',
      (c: any) => {
        c.global.guards.autoPauseEnable = true;
      },
    ],
    [
      'string boolean',
      (c: any) => {
        c.domains[0].operations.requiresHumanValidation = 'false';
      },
    ],
    [
      'fractional limit',
      (c: any) => {
        c.domains[0].operations.maxActiveJobs = 1.2;
      },
    ],
    [
      'unsafe numeric stake',
      (c: any) => {
        c.domains[0].operations.minStake = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'uint96 overflow',
      (c: any) => {
        c.domains[0].operations.minStake = (2n ** 96n).toString();
      },
    ],
    [
      'nonhex digest',
      (c: any) => {
        c.global.telemetry.metricsDigest = `0x${'z'.repeat(64)}`;
      },
    ],
    [
      'zero digest',
      (c: any) => {
        c.global.telemetry.metricsDigest = `0x${'0'.repeat(64)}`;
      },
    ],
    [
      'duplicate domain',
      (c: any) => {
        c.domains.push(c.domains[0]);
      },
    ],
    [
      'noncanonical slug',
      (c: any) => {
        c.domains[0].slug = ' Finance ';
      },
    ],
    [
      'invalid lifecycle',
      (c: any) => {
        c.domains[0].lifecycle = 'sunsett';
      },
    ],
    [
      'NaN metric',
      (c: any) => {
        c.domains[0].metadata.resilienceIndex = NaN;
      },
    ],
    [
      'negative capability',
      (c: any) => {
        c.domains[0].capabilities.credit = -1;
      },
    ],
    [
      'duplicate normalized capability',
      (c: any) => {
        c.domains[0].capabilities.CREDIT = 1;
      },
    ],
    [
      'invalid heartbeat',
      (c: any) => {
        c.domains[0].heartbeatSeconds = 0;
      },
    ],
    [
      'enabled autopilot without cadence',
      (c: any) => {
        delete c.domains[0].infrastructureControl.autopilotCadence;
      },
    ],
  ] as Array<[string, (value: any) => void]>) {
    it(`rejects ${label} before encoding`, function () {
      const config = fresh();
      mutate(config);
      expect(() => validatePhase6Config(config)).to.throw();
      expect(() => buildPhase6Blueprint(config)).to.throw();
    });
  }
  it('rejects duplicate JSON keys including escaped duplicates before values disappear', function () {
    expect(() => parsePhase6Json('{"active":true,"active":false}')).to.throw(
      'duplicate JSON key'
    );
    expect(() => parsePhase6Json('{"array":[{"a":1,"\\u0061":2}]}')).to.throw(
      'duplicate JSON key'
    );
    expect(
      parsePhase6Json('{"one":{"x":1},"two":{"x":2},"literal":"\\\\"}')
    ).to.deep.equal({ one: { x: 1 }, two: { x: 2 }, literal: '\\' });
  });
  it('minimal configuration does not manufacture optional setter payloads', function () {
    const config: any = {
      global: { manifestURI: 'ipfs://example' },
      domains: [
        {
          slug: 'test',
          name: 'Test',
          manifestURI: 'ipfs://domain',
          subgraph: 'https://example.test',
          validationModule: '0x1111111111111111111111111111111111111111',
        },
      ],
    };
    const blueprint = buildPhase6Blueprint(config);
    expect(blueprint.calldata.globalGuards).to.equal(undefined);
    expect(blueprint.calldata.globalTelemetry).to.equal(undefined);
    expect(blueprint.calldata.globalInfrastructure).to.equal(undefined);
    expect(blueprint.domains[0].calldata.setDomainOperations).to.equal(
      undefined
    );
    expect(blueprint.domains[0].calldata.setDomainTelemetry).to.equal(
      undefined
    );
    expect(blueprint.domains[0].calldata.setDomainInfrastructure).to.equal(
      undefined
    );
    expect(blueprint.metrics.telemetryMissingCount).to.equal(1);
  });
  it('does not count missing telemetry as meeting a configured floor or emit invalid telemetry calldata', function () {
    const config = fresh();
    delete config.domains[0].telemetry;
    delete config.global.telemetry;
    const blueprint = buildPhase6Blueprint(config);
    expect(blueprint.metrics.telemetryMissingCount).to.equal(1);
    expect(blueprint.metrics.resilienceSampleCount).to.equal(4);
    expect(blueprint.calldata.globalTelemetry).to.equal(undefined);
    expect(blueprint.domains[0].calldata.setDomainTelemetry).to.equal(
      undefined
    );
    config.global.telemetry = fresh().global.telemetry;
    expect(
      buildPhase6Blueprint(config).metrics.resilienceFloorCoverage
    ).to.equal(0.8);
  });
  it('matches encoded defaults and inactive domain state in the displayed plan', function () {
    const config = fresh();
    delete config.global.l2SyncCadence;
    delete config.domains[0].heartbeatSeconds;
    config.domains[0].active = false;
    const blueprint = buildPhase6Blueprint(config);
    const tuple = abi.decodeFunctionData(
      'registerDomain',
      blueprint.domains[0].calldata.registerDomain!
    )[0];
    expect(blueprint.global.l2SyncCadenceSeconds).to.equal(180);
    expect(blueprint.domains[0].heartbeatSeconds).to.equal(
      Number(tuple.heartbeatSeconds)
    );
    expect(tuple.active).to.equal(false);
    expect(blueprint.execution).to.deep.equal({
      mode: 'planning-only',
      transactionsSubmitted: false,
      workDispatched: false,
      credentialsVerified: false,
      telemetryVerified: false,
    });
  });
  it('exports removal rather than registration calldata for sunset domains', function () {
    const config = fresh();
    config.domains[0].lifecycle = 'sunset';
    config.domains[0].sunsetPlan = {
      reason: 'Retired',
      handoffDomains: ['logistics'],
    };
    const domain = buildPhase6Blueprint(config).domains[0];
    expect(domain.active).to.equal(false);
    expect(domain.calldata.registerDomain).to.equal(undefined);
    expect(domain.calldata.setDomainOperations).to.equal(undefined);
    expect(
      abi.decodeFunctionData('removeDomain', domain.calldata.removeDomain!)[0]
    ).to.equal(domain.domainId);
  });
  it('rejects slug transformations that disagree with Solidity identifiers', function () {
    expect(domainIdFromSlug('FINANCE')).to.equal(domainIdFromSlug('finance'));
    expect(() => domainIdFromSlug(' finance')).to.throw();
    expect(() => domainIdFromSlug('fİnance')).to.throw();
  });
  it('retains exact on-chain uint64 values and omitted connector addresses during partial updates', function () {
    const huge = 9007199254740993n;
    const address = '0x1111111111111111111111111111111111111111';
    const zero = '0x' + '0'.repeat(40);
    const digest = '0x' + '0'.repeat(64);
    const state: any = {
      global: {
        manifestURI: 'ipfs://global',
        iotOracleRouter: address,
        defaultL2Gateway: address,
        didRegistry: address,
        treasuryBridge: address,
        l2SyncCadence: huge,
      },
      globalGuards: {
        treasuryBufferBps: 0,
        circuitBreakerBps: 0,
        anomalyGracePeriod: 0,
        autoPauseEnabled: false,
        oversightCouncil: zero,
      },
      globalTelemetry: {
        manifestHash: digest,
        metricsDigest: digest,
        resilienceFloorBps: 0,
        automationFloorBps: 0,
        oversightWeightBps: 0,
      },
      globalInfrastructure: {
        meshCoordinator: address,
        dataLake: address,
        identityBridge: address,
        topologyURI: 'ipfs://old',
        autopilotCadence: huge,
        enforceDecentralizedInfra: true,
      },
      systemPause: zero,
      escalationBridge: zero,
      domains: [
        {
          id: domainIdFromSlug('test'),
          slug: 'test',
          name: 'Test',
          metadataURI: 'ipfs://domain',
          subgraphEndpoint: 'https://example.test',
          validationModule: address,
          dataOracle: address,
          l2Gateway: address,
          executionRouter: address,
          heartbeatSeconds: huge,
          active: true,
        },
      ],
      domainOperations: {},
      domainTelemetry: {},
      domainInfrastructure: {
        test: {
          agentOps: address,
          dataPipeline: address,
          credentialVerifier: address,
          fallbackOperator: address,
          controlPlaneURI: 'ipfs://old',
          autopilotCadence: huge,
          autopilotEnabled: true,
        },
      },
    };
    const desired: any = {
      global: {
        manifestURI: 'ipfs://global',
        infrastructure: { topologyURI: 'ipfs://new' },
      },
      domains: [
        {
          slug: 'test',
          name: 'Test',
          manifestURI: 'ipfs://domain',
          subgraph: 'https://example.test',
          validationModule: address,
          infrastructureControl: { controlPlaneURI: 'ipfs://new' },
        },
      ],
    };
    const plan = planPhase6Changes(state, desired);
    expect(plan.global).to.equal(undefined);
    expect(plan.domains).to.have.length(0);
    expect(plan.globalInfrastructure!.config.autopilotCadence).to.equal(huge);
    expect(plan.domainInfrastructure[0].config.autopilotCadence).to.equal(huge);
    expect(plan.globalInfrastructure!.diffs).to.deep.equal(['topologyURI']);
    expect(plan.domainInfrastructure[0].diffs).to.deep.equal([
      'controlPlaneURI',
    ]);
  });
  it('rejects failed on-chain reads instead of fabricating missing telemetry', async function () {
    const config = fresh();
    const overrides: any[] = [];
    const record =
      (value: any) =>
      async (...args: any[]) => {
        overrides.push(args.at(-1));
        return value;
      };
    const manager: any = {
      globalConfig: record([]),
      systemPause: record('0x' + '0'.repeat(40)),
      escalationBridge: record('0x' + '0'.repeat(40)),
      listDomains: record([
        {
          id: domainIdFromSlug('finance'),
          config: {
            slug: 'finance',
            name: 'Finance',
            metadataURI: config.global.manifestURI,
            validationModule: config.domains[0].validationModule,
          },
        },
      ]),
      globalGuards: record([]),
      globalTelemetry: record([]),
      globalInfrastructure: record([]),
      getDomainOperations: record([]),
      getDomainTelemetry: async () => {
        throw new Error('RPC unavailable');
      },
    };
    let error: Error | undefined;
    try {
      await fetchPhase6State(manager, 123);
    } catch (caught) {
      error = caught as Error;
    }
    expect(error?.message).to.equal('RPC unavailable');
    expect(overrides.every((value) => value.blockTag === 123)).to.equal(true);
  });
  it('does not mistake a credential inventory for cryptographic verification', function () {
    const config = fresh();
    config.domains[0].credentials[0].issuers = [];
    const report = createDidAuditReport(buildPhase6Blueprint(config));
    expect(report.credentialsVerified).to.equal(false);
    expect(report.revocationChecked).to.equal(false);
    expect(report.domainFindings[0].gaps.join(' ')).to.include('no issuers');
  });
});

describe('Phase 6 bounded routing proposals', function () {
  it('blocks unmet capability floors, required human review, unknown domains and inactive domains', function () {
    for (const change of [
      (config: any, event: EventPayload) => {
        event.requiredCapabilities = { routing: 5 };
      },
      (config: any, event: EventPayload) => {
        event.metadata = { requiresHumanInLoop: true };
      },
      (config: any, event: EventPayload) => {
        event.domainHint = 'unknown';
      },
      (config: any) => {
        config.domains.find((d: any) => d.slug === 'logistics').active = false;
      },
      (config: any, event: EventPayload) => {
        event.requiredSkills = ['unknown'];
      },
    ]) {
      const config = fresh();
      const event = sample();
      change(config, event);
      const [result] = evaluateEvents(buildPhase6Blueprint(config), [event]);
      expect(result.status).to.equal('blocked');
      expect(result.recommendedDomain).to.equal(null);
      expect(result.executionAuthorized).to.equal(false);
    }
  });
  it('keeps every credential requirement in a matching proposal', function () {
    const config = fresh();
    const domain = config.domains.find((d: any) => d.slug === 'logistics');
    domain.credentials.push({
      ...domain.credentials[0],
      name: 'Third required credential',
    });
    const [result] = evaluateEvents(buildPhase6Blueprint(config), [sample()]);
    expect(result.status).to.equal('proposal');
    expect(result.executionAuthorized).to.equal(false);
    expect(result.credentialPlan!.requirements).to.have.length(3);
  });
  it('rejects ambiguous event requirements', function () {
    const blueprint = buildPhase6Blueprint(fresh());
    expect(() =>
      evaluateEvents(blueprint, [
        { ...sample(), metadata: { requiresHumanInLoop: 'false' } },
      ])
    ).to.throw();
    expect(() =>
      evaluateEvents(blueprint, [
        { ...sample(), requiredCapabilities: { routing: NaN } },
      ])
    ).to.throw();
    expect(() => evaluateEvents(blueprint, [sample(), sample()])).to.throw();
  });
});

describe('Phase 6 strict CLI parsing', function () {
  it('preserves equals characters and rejects unknown, repeated or empty options', function () {
    expect(
      parsePhase6Args(
        ['--config=a=b.json', '--json=-'],
        'default',
        ['json'],
        () => {}
      )
    ).to.deep.equal({ configPath: 'a=b.json', jsonOutput: '-' });
    for (const argv of [
      ['--typo'],
      ['--config', '--json'],
      ['--config='],
      ['--json='],
      ['--config=a', '--config=b'],
    ]) {
      expect(() =>
        parsePhase6Args(argv, 'default', ['json'], () => {})
      ).to.throw();
    }
  });
  it('each JSON CLI emits one parseable JSON document and accepts an equals-containing config path', function () {
    this.timeout(30000);
    const dir = mkdtempSync(join(tmpdir(), 'phase6-cli-'));
    const config = join(dir, 'config=example.json');
    copyFileSync(configPath, config);
    try {
      for (const script of [
        'run-phase6-demo.ts',
        'phase6-did-audit.ts',
        'phase6-iot-simulator.ts',
      ]) {
        const result = spawnSync(
          process.execPath,
          [
            '-r',
            'ts-node/register',
            `demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/${script}`,
            `--config=${config}`,
            '--json=-',
          ],
          { encoding: 'utf8' }
        );
        expect(result.status, result.stderr).to.equal(0);
        expect(() => JSON.parse(result.stdout)).not.to.throw();
      }
      const output = join(dir, 'runbook=example.md');
      const result = spawnSync(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          'demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/generate-phase6-runbook.ts',
          `--config=${config}`,
          `--output=${output}`,
        ],
        { encoding: 'utf8' }
      );
      expect(result.status, result.stderr).to.equal(0);
      expect(readFileSync(output, 'utf8')).to.include('Planning only');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
