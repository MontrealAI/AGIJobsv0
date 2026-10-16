const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const {
  buildJobRegistryPlan,
} = require('../../scripts/v2/lib/jobRegistryPlan');

describe('JobRegistry owner-plan compatibility preflight', function () {
  let owner, registry, validation, reputation, versionFactory;
  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    versionFactory = await ethers.getContractFactory(
      'contracts/v2/mocks/VersionMock.sol:VersionMock'
    );
    validation = await versionFactory.deploy(2);
    reputation = await versionFactory.deploy(3);
    const shared = await versionFactory.deploy(2);
    const sharedAddress = await shared.getAddress();
    const factory = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await factory.deploy(
      await validation.getAddress(),
      sharedAddress,
      await reputation.getAddress(),
      sharedAddress,
      sharedAddress,
      sharedAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address,
      await deployImplementations('JobRegistry', owner)
    );
  });

  const plan = (config, target = registry) =>
    buildJobRegistryPlan({
      registry: target,
      config,
      decimals: 18,
      symbol: 'AGIALPHA',
    });

  async function expectRejected(config, message) {
    const before = await ethers.provider.getTransactionCount(owner.address);
    await expect(plan(config)).to.be.rejectedWith(message);
    expect(await ethers.provider.getTransactionCount(owner.address)).to.equal(
      before
    );
    expect(await registry.validationModule()).to.equal(
      await validation.getAddress()
    );
  }

  async function wrongPolicy(
    contract,
    policy = ethers.id('unsupported-policy')
  ) {
    const address = await contract.getAddress();
    const code = await ethers.provider.getCode(address);
    const expected = ethers.id('AGIJobs:terminal-reputation-v3').slice(2);
    expect(code).to.include(expected);
    await network.provider.send('hardhat_setCode', [
      address,
      code.split(expected).join(policy.slice(2)),
    ]);
  }

  it('plans a valid v2 validation and v3 engine bundle without broadcasting', async function () {
    const replacement = await versionFactory.deploy(2);
    const before = await ethers.provider.getTransactionCount(owner.address);
    const result = await plan({
      validationModule: await replacement.getAddress(),
    });
    const action = result.actions.find(({ method }) => method === 'setModules');
    expect(action.args[0]).to.equal(await replacement.getAddress());
    expect(action.args[2]).to.equal(await reputation.getAddress());
    expect(action.notes[0]).to.include('ReputationEngine version 3');
    expect(action.notes[0]).to.include('other bundle modules version 2');
    expect(action.notes[0]).to.include('AGIJobs:terminal-reputation-v3');
    expect(await ethers.provider.getTransactionCount(owner.address)).to.equal(
      before
    );
    expect(await registry.validationModule()).to.equal(
      await validation.getAddress()
    );
  });

  for (const name of ['NoValidationModule', 'OracleValidationModule']) {
    it(`rejects legacy ${name} before returning a module plan`, async function () {
      const factory = await ethers.getContractFactory(
        `contracts/v2/modules/${name}.sol:${name}`
      );
      const adapter =
        name === 'NoValidationModule'
          ? await factory.deploy(await registry.getAddress())
          : await factory.deploy(
              await registry.getAddress(),
              ethers.ZeroAddress
            );
      await expectRejected(
        { validationModule: await adapter.getAddress() },
        'validation module must expose terminalPolicyId AGIJobs:terminal-reputation-v3'
      );
    });
  }

  it('rejects a validation target with the wrong policy', async function () {
    const replacement = await versionFactory.deploy(2);
    await wrongPolicy(replacement);
    await expectRejected(
      { validationModule: await replacement.getAddress() },
      'validation module must expose terminalPolicyId AGIJobs:terminal-reputation-v3'
    );
  });

  it('rejects a validation target with the wrong version', async function () {
    const replacement = await versionFactory.deploy(3);
    await expectRejected(
      { validationModule: await replacement.getAddress() },
      'validation module must expose version() == 2'
    );
  });

  it('rejects a legacy v2 reputation engine even with the expected policy', async function () {
    const replacement = await versionFactory.deploy(2);
    await expectRejected(
      { reputationModule: await replacement.getAddress() },
      'reputation module must expose version() == 3'
    );
  });

  it('rejects a v3 reputation engine with the wrong policy', async function () {
    const replacement = await versionFactory.deploy(3);
    await wrongPolicy(replacement);
    await expectRejected(
      { reputationModule: await replacement.getAddress() },
      'reputation module must expose terminalPolicyId AGIJobs:terminal-reputation-v3'
    );
  });

  it('rejects a registry even when every terminal target shares its unsupported policy', async function () {
    const replacement = await versionFactory.deploy(2);
    const unsupported = ethers.id('matching-but-unsupported-policy');
    for (const target of [registry, replacement, reputation])
      await wrongPolicy(target, unsupported);
    await expectRejected(
      { validationModule: await replacement.getAddress() },
      'JobRegistry must expose terminalPolicyId AGIJobs:terminal-reputation-v3'
    );
  });

  it('does not add capability calls to unrelated or unchanged plans', async function () {
    const unsupported = ethers.id('unsupported-policy');
    await wrongPolicy(registry, unsupported);
    const unchanged = await plan({
      validationModule: await validation.getAddress(),
    });
    expect(unchanged.actions).to.have.length(0);
    const unrelated = await plan({ jobStakeBps: 1500 });
    expect(unrelated.actions.map(({ method }) => method)).to.deep.equal([
      'setJobStakeBps',
    ]);
  });

  it('reports a missing provider instead of returning an unchecked module plan', async function () {
    const replacement = await versionFactory.deploy(2);
    const providerless = Object.create(registry);
    Object.defineProperty(providerless, 'runner', { value: null });
    await expect(
      plan({ validationModule: await replacement.getAddress() }, providerless)
    ).to.be.rejectedWith(
      'JobRegistry contract runner and provider are required for module preflight'
    );
  });
});
