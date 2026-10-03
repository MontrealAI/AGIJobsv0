const { expect } = require('chai');
const { stageProtocol } = require('../../scripts/deploy/stage-protocol.cjs');
const { ethers, artifacts, config } = require('hardhat');
const modules = require('../../config/implementation-modules.json');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const {
  checkArtifacts,
} = require('../../scripts/release/check-contract-size.js');

function normalizeType(id, types) {
  const type = types[id];
  const normalized = {
    label: type.label.replace(
      /(JobRegistry|StakeManager|ValidationModule)Base\./g,
      '$1.'
    ),
    encoding: type.encoding,
    numberOfBytes: type.numberOfBytes,
  };
  for (const field of ['key', 'value', 'base']) {
    if (type[field]) normalized[field] = normalizeType(type[field], types);
  }
  if (type.members)
    normalized.members = normalizeLayout({ storage: type.members, types });
  return normalized;
}

function normalizeLayout(layout) {
  return layout.storage.map(({ label, slot, offset, type }) => ({
    label,
    slot,
    offset,
    type: normalizeType(type, layout.types),
  }));
}

async function layoutFor(name, implementation = false) {
  const source = `contracts/v2/${
    implementation ? 'implementation/' : ''
  }${name}.sol`;
  const build = await artifacts.getBuildInfo(`${source}:${name}`);
  return normalizeLayout(build.output.contracts[source][name].storageLayout);
}

describe('Fixed implementations production compatibility', function () {
  it('keeps interrupted deployments paused, resumes components, and finalizes within transaction gas limits', async function () {
    const [owner, governance, stranger] = await ethers.getSigners();
    const tokenArtifact = await artifacts.readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    const { address: tokenAddress } = require('../../config/agialpha.json');
    await ethers.provider.send('hardhat_setCode', [
      tokenAddress,
      tokenArtifact.deployedBytecode,
    ]);
    const factory = await ethers.getContractFactory(
      'contracts/v2/Deployer.sol:Deployer'
    );
    const deployer = await factory.deploy();
    const ids = {
      ens: ethers.ZeroAddress,
      nameWrapper: ethers.ZeroAddress,
      clubRootNode: ethers.ZeroHash,
      agentRootNode: ethers.ZeroHash,
      validatorMerkleRoot: ethers.ZeroHash,
      agentMerkleRoot: ethers.ZeroHash,
    };
    const econ = {
      feePct: 0,
      burnPct: 0,
      employerSlashPct: 0,
      treasurySlashPct: 0,
      validatorSlashRewardPct: 0,
      commitWindow: 0,
      revealWindow: 0,
      minStake: ethers.parseEther('2'),
      jobStake: 0,
    };
    let interrupted = false;
    try {
      await stageProtocol(deployer, ids, governance.address, {
        econ,
        onDeployed: async (name) => {
          if (name === 'JobRegistry')
            throw new Error('simulated process interruption');
        },
      });
    } catch (error) {
      if (error.message !== 'simulated process interruption') throw error;
      interrupted = true;
    }
    expect(interrupted).to.equal(true);
    const registryAddress = await deployer.components(ethers.id('JobRegistry'));
    const stakeAddress = await deployer.components(ethers.id('StakeManager'));
    const registry = await ethers.getContractAt(
      'contracts/v2/JobRegistry.sol:JobRegistry',
      registryAddress
    );
    const stake = await ethers.getContractAt(
      'contracts/v2/StakeManager.sol:StakeManager',
      stakeAddress
    );
    expect(await registry.paused()).to.equal(true);
    expect(await stake.paused()).to.equal(true);
    await expect(
      deployer
        .connect(stranger)
        .deployComponent(ethers.id('extra'), '0x00', false)
    ).to.be.revertedWithCustomError(deployer, 'OwnableUnauthorizedAccount');
    await expect(
      registry.createJob(0, 1, ethers.id('spec'), 'ipfs://spec')
    ).to.be.revertedWithCustomError(registry, 'EnforcedPause');
    let mismatch = false;
    try {
      await stageProtocol(deployer, ids, governance.address);
    } catch (error) {
      mismatch = /Cannot resume StakeManager/.test(error.message);
    }
    expect(mismatch).to.equal(true);
    const staged = await stageProtocol(deployer, ids, governance.address, {
      econ,
    });
    expect(staged[0]).to.equal(stakeAddress);
    expect(staged[1]).to.equal(registryAddress);
    expect(await registry.paused()).to.equal(true);
    expect(await stake.minStakeFloor()).to.equal(econ.minStake);
    const before = await ethers.provider.getTransactionCount(owner.address);
    expect(
      await stageProtocol(deployer, ids, governance.address, { econ })
    ).to.deep.equal(staged);
    expect(await ethers.provider.getTransactionCount(owner.address)).to.equal(
      before
    );
    await expect(
      deployer.deployWithoutTaxPolicy(econ, ids, governance.address)
    ).to.be.revertedWith('tax policy mode');
    expect(await deployer.deployed()).to.equal(false);
    expect(await registry.paused()).to.equal(true);
    expect(
      Array.from(
        await deployer.deploy.staticCall(econ, ids, governance.address)
      )
    ).to.deep.equal(staged.slice(0, 13));
    const receipt = await (
      await deployer.deploy(econ, ids, governance.address)
    ).wait();
    expect(receipt.gasUsed).to.be.lessThan(16777216n);
    expect(await registry.paused()).to.equal(false);
    expect(await stake.paused()).to.equal(false);
    expect(await registry.owner()).to.equal(staged[12]);
    expect(await stake.minStake()).to.equal(econ.minStake);
    for (const event of await deployer.queryFilter(
      deployer.filters.ComponentDeployed()
    )) {
      const tx = await ethers.provider.getTransactionReceipt(
        event.transactionHash
      );
      expect(tx.gasUsed).to.be.lessThan(16777216n);
    }
    await expect(
      deployer.deploy(econ, ids, governance.address)
    ).to.be.revertedWith('deployed');
  });
  it('enforces production bytecode limits for every deployable v2 artifact', function () {
    expect(config.networks.hardhat.allowUnlimitedContractSize).to.equal(false);
    const report = checkArtifacts(config.paths.artifacts);
    expect(report.contracts.filter((row) => !row.deployableSize)).to.deep.equal(
      []
    );
  });

  it('keeps no-compile demo bytecode in sync with the compiled modular contracts', async function () {
    const prebuilt = require('../../scripts/v2/lib/prebuilt/ImplementationModules.json');
    expect(Object.keys(prebuilt).sort()).to.deep.equal(
      Object.values(modules).flat().sort()
    );
    for (const [controller, names] of Object.entries(modules)) {
      const bundledController = require(`../../scripts/v2/lib/prebuilt/${controller}.json`);
      const compiledController = await artifacts.readArtifact(
        `contracts/v2/${controller}.sol:${controller}`
      );
      expect(bundledController).to.deep.equal({
        abi: compiledController.abi,
        bytecode: compiledController.bytecode,
      });
      for (const name of names) {
        const compiled = await artifacts.readArtifact(
          `contracts/v2/implementation/${name}.sol:${name}`
        );
        expect(prebuilt[name], name).to.deep.equal({
          abi: compiled.abi,
          bytecode: compiled.bytecode,
        });
      }
    }
  });

  for (const [controller, implementations] of Object.entries(modules)) {
    it(`${controller} preserves every previous function, event, and error signature`, async function () {
      const baseline = require(`../fixtures/modular-baseline/${controller}.json`);
      const artifact = await artifacts.readArtifact(
        `contracts/v2/${controller}.sol:${controller}`
      );
      const expected = new ethers.Interface(baseline.abi);
      const actual = new ethers.Interface(artifact.abi);
      const signatures = new Set(
        actual.fragments
          .filter((f) => ['function', 'event', 'error'].includes(f.type))
          .map((f) => f.format('full'))
      );
      for (const fragment of expected.fragments) {
        if (!['function', 'event', 'error'].includes(fragment.type)) continue;
        expect(
          signatures.has(fragment.format('full')),
          fragment.format('full')
        ).to.equal(true);
      }
    });

    it(`${controller} preserves storage offsets and shares the exact layout with every implementation`, async function () {
      const baseline = require(`../fixtures/modular-baseline/${controller}.json`);
      const actual = await layoutFor(controller);
      const previous = normalizeLayout(baseline.storageLayout);
      expect(actual.slice(0, previous.length)).to.deep.equal(previous);
      if (controller === 'ValidationModule') {
        expect(actual.slice(previous.length).map((s) => s.label)).to.deep.equal(
          ['DOMAIN_SEPARATOR']
        );
      } else expect(actual.length).to.equal(previous.length);
      for (const implementation of implementations) {
        expect(
          await layoutFor(implementation, true),
          implementation
        ).to.deep.equal(actual);
      }
    });
  }

  it('uses immutable implementations, preserves the caller, and rejects direct writes and invalid modules', async function () {
    const [owner, stranger] = await ethers.getSigners();
    const addresses = await deployImplementations('JobRegistry', owner);
    const factory = await ethers.getContractFactory(
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
    ];
    await expect(
      factory.deploy(...args, [ethers.ZeroAddress, ...addresses.slice(1)])
    ).to.be.revertedWithCustomError(factory, 'InvalidImplementation');
    await expect(
      factory.deploy(...args, [addresses[1], addresses[0], addresses[2]])
    ).to.be.revertedWithCustomError(factory, 'InvalidImplementation');
    const registry = await factory.deploy(...args, addresses);
    const receipt = await registry.deploymentTransaction().wait();
    expect(receipt.gasUsed).to.be.lessThan(16777216n);
    expect(Array.from(await registry.implementationModules())).to.deep.equal(
      addresses
    );
    const implementation = await ethers.getContractAt(
      'JobRegistryConfiguration',
      addresses[0]
    );
    await expect(implementation.setJobStake(123)).to.be.revertedWithCustomError(
      implementation,
      'DirectImplementationCall'
    );
    await expect(
      registry.connect(stranger).setJobStake(123)
    ).to.be.revertedWithCustomError(registry, 'NotGovernance');
    await expect(registry.setJobStake(123))
      .to.emit(registry, 'JobParametersUpdated')
      .withArgs(0, 123, 0, 0, 0);
    expect(await registry.jobStake()).to.equal(123);
    expect(await implementation.jobStake()).to.equal(0);
    await registry.transferOwnership(stranger.address);
    await expect(registry.setJobStake(456)).to.be.revertedWithCustomError(
      registry,
      'NotGovernance'
    );
    await registry.connect(stranger).setJobStake(456);
    expect(await registry.jobStake()).to.equal(456);
    expect(Array.from(await registry.implementationModules())).to.deep.equal(
      addresses
    );
  });

  it('binds voting domain separators to each controller while sharing implementations', async function () {
    const addresses = await deployImplementations('ValidationModule');
    const factory = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    const args = [
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      0,
      0,
      [],
      addresses,
    ];
    const first = await factory.deploy(...args);
    const second = await factory.deploy(...args);
    const domain = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'bytes32', 'address', 'uint256'],
        [
          ethers.id(
            'ValidationModule(string version,address verifyingContract,uint256 chainId)'
          ),
          ethers.id('1'),
          await first.getAddress(),
          (await ethers.provider.getNetwork()).chainId,
        ]
      )
    );
    expect(await first.DOMAIN_SEPARATOR()).to.equal(domain);
    expect(await second.DOMAIN_SEPARATOR()).not.to.equal(domain);
    for (const address of addresses) {
      const implementation = await ethers.getContractAt(
        'contracts/v2/ValidationModule.sol:ValidationModule',
        address
      );
      expect(await implementation.DOMAIN_SEPARATOR()).to.equal(ethers.ZeroHash);
    }
  });
});
