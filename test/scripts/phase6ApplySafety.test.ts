import { expect } from 'chai';
import { ethers } from 'hardhat';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPhase6Context,
  assertPhase6ContractTargets,
  buildPhase6Transactions,
  parsePhase6Args,
  PHASE6_INTERFACE,
  PHASE6_SPEC_VERSION,
} from '../../scripts/phase6/apply-config-safety';
import type { Phase6Plan } from '../../scripts/phase6/apply-config-lib';
import { main } from '../../scripts/phase6/apply-config';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const baseArgs = () => parsePhase6Args(['--manager', ADDRESS]);
const emptyPlan = (): Phase6Plan => ({
  domains: [],
  domainOperations: [],
  domainTelemetry: [],
  domainInfrastructure: [],
  warnings: [],
});

async function rejection(
  promise: Promise<unknown>,
  message: string
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(String(error)).to.contain(message);
    return;
  }
  throw new Error(`Expected rejection containing ${message}`);
}

describe('Phase6 configuration execution safety', function () {
  it('defaults to preview and rejects unbound writes, malformed flags, and conflicting modes', function () {
    expect(baseArgs().dryRun).to.equal(true);
    for (const extra of [
      ['--apply'],
      ['--chain-id', '0'],
      ['--chain-id', '1.2'],
      ['--apply', '--dry-run'],
      ['--config', '--apply'],
      ['ignored-positional'],
      ['--domain', 'Finance'],
      ['--domain', 'finance,'],
      ['--manager', OTHER],
      ['--chain-id', '1', '--chain-id', '31337'],
      ['--config', 'a.json', '--config', 'b.json'],
      ['--export', 'a.json', '--export-plan', 'b.json'],
      ['--apply', '--chain-id', '31337'],
    ])
      expect(() =>
        parsePhase6Args(['--manager', ADDRESS, ...extra])
      ).to.throw();
    const args = parsePhase6Args([
      '--manager',
      ADDRESS,
      '--apply',
      '--chain-id',
      '31337',
      '--export-plan',
      '/tmp/phase6-plan.json',
      '--domain',
      'finance,health',
    ]);
    expect(args.expectedChainId).to.equal(31337n);
    expect(args.onlyDomains.size).to.equal(2);
  });

  it('checks spec, expected chain, and governance signer independently', function () {
    const context = {
      actualChainId: 31337n,
      expectedChainId: 31337n,
      specVersion: PHASE6_SPEC_VERSION,
      governance: ADDRESS,
      signer: ADDRESS,
      apply: true,
    };
    expect(() => assertPhase6Context(context)).not.to.throw();
    expect(() =>
      assertPhase6Context({ ...context, expectedChainId: 1n })
    ).to.throw('Chain mismatch');
    expect(() =>
      assertPhase6Context({ ...context, expectedChainId: undefined })
    ).to.throw('explicitly expected');
    expect(() =>
      assertPhase6Context({ ...context, specVersion: 'phase6.expansion.v1' })
    ).to.throw('Unsupported');
    expect(() => assertPhase6Context({ ...context, signer: OTHER })).to.throw(
      'not manager governance'
    );
    expect(() =>
      assertPhase6Context({ ...context, signer: undefined })
    ).to.throw('not manager governance');
    expect(() =>
      assertPhase6Context({ ...context, signer: undefined, apply: false })
    ).not.to.throw();
    expect(() =>
      assertPhase6Context({ ...context, expectedChainId: 1n, apply: false })
    ).to.throw('Chain mismatch');
  });

  it('exports the corrected connector ABI including its domain id', function () {
    const values = [
      ethers.id('finance'),
      ADDRESS,
      ADDRESS,
      ADDRESS,
      'https://example.com/subgraph',
      ADDRESS,
      120,
    ];
    const data = PHASE6_INTERFACE.encodeFunctionData(
      'configureDomainConnectors',
      values
    );
    expect(
      PHASE6_INTERFACE.decodeFunctionData('configureDomainConnectors', data)[0]
    ).to.equal(values[0]);
    expect(
      PHASE6_INTERFACE.getFunction('setDomainInfrastructure')
    ).not.to.equal(null);
    expect(
      PHASE6_INTERFACE.getEvent('GlobalInfrastructureUpdated')
    ).not.to.equal(null);
  });

  it('keeps preview filters and sent calldata identical, with explicit global filter semantics', function () {
    const plan = emptyPlan();
    plan.systemPause = { action: 'setSystemPause', target: ADDRESS };
    plan.domains = ['finance', 'health'].map((slug) => ({
      action: 'removeDomain',
      slug,
      id: ethers.id(slug),
      lifecycle: 'sunset',
      diffs: ['lifecycle'],
    }));
    const args = {
      ...baseArgs(),
      onlyDomains: new Set(['finance']),
      skipSystemPause: true,
    };
    const transactions = buildPhase6Transactions(plan, args);
    expect(transactions.map((transaction) => transaction.label)).to.deep.equal([
      'removeDomain(finance)',
    ]);
    expect(
      PHASE6_INTERFACE.decodeFunctionData(
        'removeDomain',
        transactions[0].data
      )[0]
    ).to.equal(ethers.id('finance'));
    expect(transactions[0].value).to.equal('0');
  });

  it('requires deployed connector code while allowing an EOA fallback operator', async function () {
    const plan = emptyPlan();
    plan.domainInfrastructure = [
      {
        action: 'setDomainInfrastructure',
        slug: 'finance',
        id: ethers.id('finance'),
        diffs: ['agentOps'],
        config: {
          agentOps: ADDRESS,
          dataPipeline: ethers.ZeroAddress,
          credentialVerifier: ethers.ZeroAddress,
          fallbackOperator: OTHER,
          controlPlaneURI: 'ipfs://example',
          autopilotCadence: 30n,
          autopilotEnabled: true,
        },
      },
    ];
    const calls: Array<[string, number | undefined]> = [];
    const transactions = buildPhase6Transactions(plan, baseArgs());
    await assertPhase6ContractTargets(
      {
        getCode: async (address, block) => {
          calls.push([address, block]);
          return '0x6000';
        },
      },
      ADDRESS,
      transactions,
      42
    );
    expect(calls).to.deep.equal([[ADDRESS, 42]]);
    await rejection(
      assertPhase6ContractTargets(
        { getCode: async () => '0x' },
        ADDRESS,
        transactions
      ),
      'no deployed bytecode'
    );
  });

  it('previews without writes, applies with readback, and rejects illustrative or unauthorized writes', async function () {
    const [governance, outsider] = await ethers.getSigners();
    const factory = await ethers.getContractFactory('Phase6ExpansionManager');
    const manager = await factory.deploy(governance.address);
    await manager.waitForDeployment();
    const directory = mkdtempSync(join(tmpdir(), 'phase6-apply-'));
    const configPath = join(directory, 'config.json');
    const planPath = join(directory, 'plan.json');
    const config = {
      scenario: {
        mode: 'operator-supplied',
        description: 'Local contract test.',
      },
      global: { manifestURI: 'ipfs://phase6/test' },
      domains: [
        {
          slug: 'finance',
          name: 'Finance',
          manifestURI: 'ipfs://phase6/finance',
          subgraph: 'https://example.com/finance',
          validationModule: String(manager.target),
          heartbeatSeconds: 120,
        },
      ],
    };
    const args = [
      '--manager',
      String(manager.target),
      '--chain-id',
      '31337',
      '--config',
      configPath,
      '--export-plan',
      planPath,
    ];
    try {
      writeFileSync(configPath, JSON.stringify(config));
      await main(args);
      let evidence = JSON.parse(readFileSync(planPath, 'utf8'));
      expect(evidence.execution.status).to.equal('preview');
      expect(evidence.execution.transactions).to.deep.equal([]);
      expect((await manager.globalConfig()).manifestURI).to.equal('');
      expect(evidence.encodedTransactions).to.have.length(2);
      await main([...args, '--apply']);
      evidence = JSON.parse(readFileSync(planPath, 'utf8'));
      expect(evidence.execution.status).to.equal('verified');
      expect(evidence.execution.transactions[0].status).to.equal('confirmed');
      expect(evidence.execution.implementationIdentityVerified).to.equal(false);
      expect(evidence.execution.verifiedBlock.hash).to.match(
        /^0x[0-9a-f]{64}$/
      );
      expect((await manager.globalConfig()).manifestURI).to.equal(
        config.global.manifestURI
      );
      const invalidTargets = {
        ...config,
        global: { manifestURI: 'ipfs://must-not-apply' },
        domains: [{ ...config.domains[0], validationModule: outsider.address }],
      };
      writeFileSync(configPath, JSON.stringify(invalidTargets));
      await rejection(main([...args, '--apply']), 'no deployed bytecode');
      evidence = JSON.parse(readFileSync(planPath, 'utf8'));
      expect(evidence.execution.status).to.equal('failed');
      expect(evidence.execution.transactions).to.deep.equal([]);
      expect((await manager.globalConfig()).manifestURI).to.equal(
        config.global.manifestURI
      );
      writeFileSync(configPath, JSON.stringify(config));
      await manager.setGovernance(outsider.address);
      await rejection(main([...args, '--apply']), 'not manager governance');
      writeFileSync(
        configPath,
        JSON.stringify({
          ...config,
          scenario: { ...config.scenario, mode: 'illustrative' },
        })
      );
      await rejection(main([...args, '--apply']), 'operator-supplied');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
