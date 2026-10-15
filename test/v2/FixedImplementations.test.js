const { expect } = require('chai');
const { stageProtocol } = require('../../scripts/deploy/stage-protocol.cjs');
const { ethers, artifacts, config } = require('hardhat');
const modules = require('../../config/implementation-modules.json');
const {
  deployImplementations,
  readImplementationAddresses,
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
      jobStakeBps: 1000,
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
    const creationNames = [];
    expect(
      await stageProtocol(deployer, ids, governance.address, {
        econ,
        onDeployed: async (name, contract, args, source) => {
          creationNames.push(name);
          const factory = await ethers.getContractFactory(source);
          const { data } = await factory.getDeployTransaction(...args);
          expect(await deployer.componentCodeHashes(ethers.id(name))).to.equal(
            ethers.keccak256(data)
          );
          expect(await contract.getAddress()).to.equal(
            await deployer.components(ethers.id(name))
          );
        },
      })
    ).to.deep.equal(staged);
    expect(creationNames).to.have.length(14);
    expect(await ethers.provider.getTransactionCount(owner.address)).to.equal(
      before
    );
    await expect(
      deployer.deployWithoutTaxPolicy(econ, ids, governance.address)
    ).to.be.revertedWith('tax policy mode');
    expect(await deployer.deployed()).to.equal(false);
    expect(await registry.paused()).to.equal(true);
    const inventory = await readImplementationAddresses({
      StakeManager: staged[0],
      JobRegistry: staged[1],
      ValidationModule: staged[2],
    });
    expect(Object.keys(inventory).sort()).to.deep.equal(
      Object.values(modules).flat().sort()
    );
    for (const [name, address] of Object.entries(inventory)) {
      const implementation = await ethers.getContractAt(name, address);
      expect(await implementation.moduleId()).to.equal(ethers.id(`${name}:${name.startsWith('JobRegistry') ? 'percentage-stake-v3' : name.startsWith('ValidationModule') ? 'terminal-reputation-v2' : 'v1'}`));
    }
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

  it('keeps unaffected no-compile demo families in sync with compiled contracts', async function () {
    // Deprecation comments in imported IJobRegistry interfaces change IPFS metadata only.
    // Compare complete creation code excluding its bounded trailing Solidity CBOR metadata.
    const withoutMetadata = (hex) => {
      const metadata = /a2646970667358221220[0-9a-f]{64}64736f6c63430008250033/g;
      const matches = [...hex.matchAll(metadata)];
      expect(matches.length).to.equal(1);
      // Constructor data can follow CBOR. Preserve every other byte, including that suffix.
      return hex.replace(metadata, 'a2646970667358221220' + '0'.repeat(64) + '64736f6c63430008250033');
    };
    const expectSemanticBundle = (bundled, compiled, name) => {
      expect(bundled.abi, name).to.deep.equal(compiled.abi);
      expect(withoutMetadata(bundled.bytecode), name).to.equal(withoutMetadata(compiled.bytecode));
    };
    for (const name of [
      'CertificateNFT', 'DisputeModule', 'FeePool', 'IdentityRegistry',
      'QuadraticVoting',
    ]) {
      const bundled = require(`../../scripts/v2/lib/prebuilt/${name}.json`);
      const source = `contracts/v2/${name === 'DisputeModule' ? 'modules/' : ''}${name}.sol`;
      const compiled = await artifacts.readArtifact(`${source}:${name}`);
      if (name === 'DisputeModule') expectSemanticBundle(bundled, compiled, name);
      else expect(bundled, name).to.deep.equal({ abi: compiled.abi, bytecode: compiled.bytecode });
    }
    const prebuilt = require('../../scripts/v2/lib/prebuilt/ImplementationModules.json');
    expect(Object.keys(prebuilt).sort()).to.deep.equal(
      Object.values(modules).flat().sort()
    );
    for (const [controller, names] of Object.entries(modules)) {
      // Percentage JobRegistry intentionally has new semantics and module IDs.
      if (['JobRegistry', 'ValidationModule'].includes(controller)) continue;
      const bundledController = require(`../../scripts/v2/lib/prebuilt/${controller}.json`);
      const compiledController = await artifacts.readArtifact(
        `contracts/v2/${controller}.sol:${controller}`
      );
      expectSemanticBundle(bundledController, compiledController, controller);
      for (const name of names) {
        const compiled = await artifacts.readArtifact(
          `contracts/v2/implementation/${name}.sol:${name}`
        );
        expectSemanticBundle(prebuilt[name], compiled, name);
      }
    }
  });

  it('preserves the historical ReputationEngine bundle and proves only freshly compiled code fixes its growth defect', async function () {
    const { createHash } = require('node:crypto');
    const { readFileSync } = require('node:fs');
    const path = require('node:path').resolve(__dirname, '../../scripts/v2/lib/prebuilt/ReputationEngine.json');
    expect(createHash('sha256').update(readFileSync(path)).digest('hex'))
      .to.equal('8a21b153e6ce189d14ee4f69288301118c22eeaa0026627338764412e0060c36');
    const bundled = require(path);
    const compiled = await artifacts.readArtifact('contracts/v2/ReputationEngine.sol:ReputationEngine');
    expect(bundled.abi).to.deep.equal(compiled.abi);
    expect(bundled.bytecode).not.to.equal(compiled.bytecode);
    const [owner] = await ethers.getSigners();
    const stake = await (await ethers.getContractFactory('MockStakeManager')).deploy();
    const historical = await new ethers.ContractFactory(bundled.abi, bundled.bytecode, owner).deploy(await stake.getAddress());
    const current = await new ethers.ContractFactory(compiled.abi, compiled.bytecode, owner).deploy(await stake.getAddress());
    for (const engine of [historical, current]) {
      await engine.setCaller(owner.address, true);
      await engine.add(owner.address, 20000);
      expect(await engine.reputationOf(owner.address)).to.equal(19036);
    }
    await expect(historical.add(owner.address, 1)).to.be.revertedWithPanic(0x11);
    await expect(current.add(owner.address, 1)).not.to.be.reverted;
    expect(await current.reputationOf(owner.address)).to.equal(19036);
  });

  it('keeps historical no-compile demos on matched v1 bundles and rejects mixing them with percentage controllers', async function () {
    const [owner] = await ethers.getSigners();
    const {deployPrebuiltImplementations} = require('../../scripts/deploy/prebuilt-implementations.cjs');
    const addresses = await deployPrebuiltImplementations('JobRegistry', owner);
    const bundled = require('../../scripts/v2/lib/prebuilt/JobRegistry.json');
    const args = [ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,0,0,[],owner.address,addresses];
    const legacy = await new ethers.ContractFactory(bundled.abi,bundled.bytecode,owner).deploy(...args);
    expect(await legacy.jobStake()).to.equal(await legacy.DEFAULT_JOB_STAKE());
    const current = await ethers.getContractFactory('contracts/v2/JobRegistry.sol:JobRegistry');
    await expect(current.deploy(...args)).to.be.revertedWithCustomError(current,'InvalidImplementation');
    for (let i=0;i<addresses.length;i++) {
      const implementation = new ethers.Contract(addresses[i],['function moduleId() view returns (bytes32)'],owner);
      expect(await implementation.moduleId()).to.equal(ethers.id(`${modules.JobRegistry[i]}:v1`));
    }
  });

  it('preserves historical validation bundles and rejects each incompatible delegate generation', async function () {
    const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
    const pins = {'ValidationModule': 'cb90c9f64134b7ec1e162b38a06282e08431fc8005b751eabfd2b072ace6fadd', 'ImplementationModules': '0cc22007c98958a60628a1669a56f4468a1caf106760dcf563660d26e643a6f8'};
    for (const [name, digest] of Object.entries(pins)) {
      expect(createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../../scripts/v2/lib/prebuilt/' + name + '.json'))).digest('hex')).to.equal(digest);
    }
    const [owner] = await ethers.getSigners();
    const Identity = await ethers.getContractFactory('LegacyJobImplementationIdentity');
    for (const controller of ['JobRegistry', 'ValidationModule']) {
      const Factory = await ethers.getContractFactory(`contracts/v2/${controller}.sol:${controller}`);
      const current = await deployImplementations(controller, owner);
      const args = controller === 'JobRegistry'
        ? [ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,0,0,[],owner.address]
        : [ethers.ZeroAddress,ethers.ZeroAddress,60,60,3,3,[]];
      for (let i = 0; i < current.length; i++) {
        const old = await Identity.deploy(ethers.id(`${modules[controller][i]}:${controller === 'JobRegistry' ? 'percentage-stake-v2' : 'v1'}`));
        const mixed = [...current]; mixed[i] = await old.getAddress();
        await expect(Factory.deploy(...args, mixed)).to.be.revertedWithCustomError(Factory, 'InvalidImplementation');
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
        if (controller === 'JobRegistry' && ['jobStake', 'DEFAULT_JOB_STAKE'].includes(fragment.name)) {
          expect(actual.getFunction(fragment.name).stateMutability).to.equal('pure');
          continue; // Explicitly deprecated getters reject; percentage tests cover the failure.
        }
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
      expect(actual.slice(0, previous.length).map((field) => ({...field, label: field.label === '_legacyJobStake' ? 'jobStake' : field.label}))).to.deep.equal(previous);
      if (controller === 'ValidationModule') {
        expect(actual.slice(previous.length).map((s) => s.label)).to.deep.equal(
          ['DOMAIN_SEPARATOR']
        );
      } else if (controller === 'JobRegistry') {
        expect(actual.slice(previous.length).map((field) => field.label)).to.deep.equal(['_jobStakeBps', '_reputationSnapshots']);
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
    await expect(implementation.setJobStakeBps(123)).to.be.revertedWithCustomError(
      implementation,
      'DirectImplementationCall'
    );
    await expect(
      registry.connect(stranger).setJobStakeBps(123)
    ).to.be.revertedWithCustomError(registry, 'NotGovernance');
    await expect(registry.setJobStakeBps(123))
      .to.emit(registry, 'JobStakeBpsUpdated')
      .withArgs(1000, 123);
    expect(await registry.jobStakeBps()).to.equal(123);
    expect(await ethers.provider.getStorage(await implementation.getAddress(), 39)).to.equal(ethers.ZeroHash); // Delegate writes only controller rate storage.
    await registry.transferOwnership(stranger.address);
    await expect(registry.setJobStakeBps(456)).to.be.revertedWithCustomError(
      registry,
      'NotGovernance'
    );
    await registry.connect(stranger).setJobStakeBps(456);
    expect(await registry.jobStakeBps()).to.equal(456);
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
