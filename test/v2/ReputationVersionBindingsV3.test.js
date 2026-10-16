const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const {
  deployPrebuiltImplementations,
} = require('../../scripts/deploy/prebuilt-implementations.cjs');

describe('Terminal reputation v3 component compatibility', function () {
  let owner, stake, oldEngine, engine;
  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    stake = await (
      await ethers.getContractFactory(
        'contracts/v2/mocks/VersionMock.sol:VersionMock'
      )
    ).deploy(2);
    const historical = require('../../scripts/v2/lib/prebuilt/ReputationEngine.json');
    oldEngine = await new ethers.ContractFactory(
      historical.abi,
      historical.bytecode,
      owner
    ).deploy(await stake.getAddress());
    engine = await (
      await ethers.getContractFactory(
        'contracts/v2/ReputationEngine.sol:ReputationEngine'
      )
    ).deploy(await stake.getAddress());
  });
  it('rejects a genuine legacy engine at new Registry construction and setter', async function () {
    const Factory = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const modules = await deployImplementations('JobRegistry', owner);
    const args = [
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await oldEngine.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address,
      modules,
    ];
    await expect(Factory.deploy(...args)).revertedWithCustomError(
      Factory,
      'InvalidReputationModule'
    );
    args[2] = ethers.ZeroAddress;
    const registry = await Factory.deploy(...args);
    await expect(
      registry.setReputationEngine(await oldEngine.getAddress())
    ).revertedWithCustomError(registry, 'InvalidReputationModule');
    await registry.setReputationEngine(await engine.getAddress());
    await engine.setJobRegistry(await registry.getAddress(), true);
  });
  it('rejects old Validation delegates and old engine on a matched new Validation controller', async function () {
    const Factory = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    const args = [
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      60,
      60,
      3,
      3,
      [],
      await deployPrebuiltImplementations('ValidationModule', owner),
    ];
    await expect(Factory.deploy(...args)).revertedWithCustomError(
      Factory,
      'InvalidImplementation'
    );
    args[7] = await deployImplementations('ValidationModule', owner);
    const validation = await Factory.deploy(...args);
    await expect(validation.setReputationEngine(await oldEngine.getAddress()))
      .reverted;
    await validation.setReputationEngine(await engine.getAddress());
  });
  for (const [family, names, externalGeneration] of [
    [
      'JobRegistry',
      [
        'JobRegistryConfiguration',
        'JobRegistryLifecycle',
        'JobRegistrySettlement',
      ],
      'percentage-stake-v4',
    ],
    [
      'ValidationModule',
      [
        'ValidationModuleConfiguration',
        'ValidationModuleVoting',
        'ValidationModuleSelection',
      ],
      'terminal-reputation-v3',
    ],
  ]) {
    for (let index = 0; index < 3; index++) {
      it(`rejects external ${family} generation in delegate slot ${index}`, async function () {
        const Factory = await ethers.getContractFactory(
          `contracts/v2/${family}.sol:${family}`
        );
        const modules = await deployImplementations(family, owner);
        const Identity = await ethers.getContractFactory(
          'contracts/test/LegacyJobImplementationIdentity.sol:LegacyJobImplementationIdentity'
        );
        const external = await Identity.deploy(
          ethers.id(`${names[index]}:${externalGeneration}`)
        );
        modules[index] = await external.getAddress();
        const args =
          family === 'JobRegistry'
            ? [
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                0,
                0,
                [],
                owner.address,
                modules,
              ]
            : [
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                60,
                60,
                3,
                3,
                [],
                modules,
              ];
        await expect(Factory.deploy(...args)).revertedWithCustomError(
          Factory,
          'InvalidImplementation'
        );
      });
    }
  }
  it('does not authorize historical Registry lifecycle semantics on the new engine', async function () {
    const historical = require('../../scripts/v2/lib/prebuilt/JobRegistry.json');
    const registry = await new ethers.ContractFactory(
      historical.abi,
      historical.bytecode,
      owner
    ).deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address,
      await deployPrebuiltImplementations('JobRegistry', owner)
    );
    await expect(engine.setJobRegistry(await registry.getAddress(), true))
      .reverted;
    await expect(registry.setReputationEngine(await engine.getAddress()))
      .reverted;
  });
  it('allows documented v2 and v3 read-only membership engines in IdentityRegistry', async function () {
    const Factory = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );
    const identity = await Factory.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await oldEngine.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    await identity.setReputationEngine(await engine.getAddress());
    await identity.setReputationEngine(await oldEngine.getAddress());
  });
  for (const name of ['NoValidationModule', 'OracleValidationModule']) {
    it(`explicitly rejects legacy optional adapter ${name} without a terminal capability`, async function () {
      const Factory = await ethers.getContractFactory(
        'contracts/v2/JobRegistry.sol:JobRegistry'
      );
      const args = [
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        0,
        0,
        [],
        owner.address,
        await deployImplementations('JobRegistry', owner),
      ];
      const registry = await Factory.deploy(...args);
      const Adapter = await ethers.getContractFactory(
        `contracts/v2/modules/${name}.sol:${name}`
      );
      const adapter =
        name === 'NoValidationModule'
          ? await Adapter.deploy(await registry.getAddress())
          : await Adapter.deploy(
              await registry.getAddress(),
              ethers.ZeroAddress
            );
      expect(await adapter.version()).to.equal(2);
      await expect(registry.setValidationModule(await adapter.getAddress()))
        .reverted;
      expect(await registry.validationModule()).to.equal(ethers.ZeroAddress);
      args[0] = await adapter.getAddress();
      await expect(Factory.deploy(...args)).reverted;
    });
  }
});
