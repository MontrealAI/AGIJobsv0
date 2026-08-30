const { expect } = require('chai');
const { ethers } = require('hardhat');

const { finalizeValidatorSelection } = require('../helpers/validation');

function namehash(root, label) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['bytes32', 'bytes32'],
      [root, ethers.keccak256(ethers.toUtf8Bytes(label))]
    )
  );
}

function leaf(addr, label) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32'],
      [addr, ethers.id(label)]
    )
  );
}

describe('Validator ENS integration', function () {
  let owner, validator, other, v2, v3;
  let ens, resolver, wrapper, identity;
  let stakeManager, jobRegistry, reputation, validation;
  const root = ethers.id('agi');

  beforeEach(async () => {
    [owner, validator, other, v2, v3] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    ens = await ENS.deploy();
    await ens.waitForDeployment();

    const Resolver = await ethers.getContractFactory('MockResolver');
    resolver = await Resolver.deploy();
    await resolver.waitForDeployment();

    const Wrapper = await ethers.getContractFactory(
      'contracts/mocks/MockNameWrapper.sol:MockNameWrapper'
    );
    wrapper = await Wrapper.deploy();
    await wrapper.waitForDeployment();

    await ens.setResolver(root, await resolver.getAddress());

    const StakeMock = await ethers.getContractFactory('MockStakeManager');
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const JobMock = await ethers.getContractFactory('MockJobRegistry');
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();

    const RepMock = await ethers.getContractFactory('MockReputationEngine');
    reputation = await RepMock.deploy();
    await reputation.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );
    identity = await Identity.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      await reputation.getAddress(),
      ethers.ZeroHash,
      root
    );
    await identity.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      60,
      60,
      3,
      3,
      []
    );
    await validation.waitForDeployment();
    await validation.setReputationEngine(await reputation.getAddress());
    await validation.setIdentityRegistry(await identity.getAddress());

    // add filler validators
    await identity.addAdditionalValidator(v2.address);
    await identity.addAdditionalValidator(v3.address);
    await stakeManager.setStake(validator.address, 1, ethers.parseEther('1'));
    await stakeManager.setStake(v2.address, 1, ethers.parseEther('1'));
    await stakeManager.setStake(v3.address, 1, ethers.parseEther('1'));
    await validation.setValidatorPool([
      validator.address,
      v2.address,
      v3.address,
    ]);
  });

  it('allows validators to update their own subdomain and use it for selection', async () => {
    const node = namehash(root, 'v');
    await wrapper.setOwner(ethers.toBigInt(node), validator.address);
    await resolver.setAddr(node, validator.address);

    await expect(validation.connect(validator).setMySubdomain('v'))
      .to.emit(validation, 'ValidatorSubdomainUpdated')
      .withArgs(validator.address, 'v');
    expect(await validation.validatorSubdomains(validator.address)).to.equal(
      'v'
    );

    const job = {
      employer: owner.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(1, job);
    await finalizeValidatorSelection(validation, 1, {
      contributors: [validator, v2],
    });

    await expect(
      validation.connect(validator).commitValidation(1, ethers.id('h'), 'v', [])
    )
      .to.emit(identity, 'OwnershipVerified')
      .withArgs(validator.address, 'v')
      .and.to.emit(validation, 'ValidatorIdentityVerified')
      .withArgs(validator.address, node, 'v', true, false)
      .and.to.emit(validation, 'ValidationCommitted')
      .withArgs(1, validator.address, ethers.id('h'), 'v');
  });

  it('rejects validators without subdomains and emits events on success', async () => {
    const job = {
      employer: owner.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(1, job);
    await expect(
      finalizeValidatorSelection(validation, 1, {
        contributors: [validator, v2],
      })
    ).to.be.revertedWithCustomError(validation, 'InsufficientValidators');

    await validation.setValidatorSubdomains([validator.address], ['v']);
    await wrapper.setOwner(
      ethers.toBigInt(namehash(root, 'v')),
      validator.address
    );
    await resolver.setAddr(namehash(root, 'v'), validator.address);

    await jobRegistry.setJob(2, job);
    await finalizeValidatorSelection(validation, 2, {
      contributors: [validator, v2],
      entropy: 99999,
    });
    await expect(
      validation.connect(validator).commitValidation(2, ethers.id('h'), 'v', [])
    )
      .to.emit(identity, 'OwnershipVerified')
      .withArgs(validator.address, 'v')
      .and.to.emit(validation, 'ValidatorIdentityVerified')
      .withArgs(validator.address, namehash(root, 'v'), 'v', true, false)
      .and.to.emit(validation, 'ValidationCommitted')
      .withArgs(2, validator.address, ethers.id('h'), 'v');
  });

  it('rejects invalid Merkle proofs', async () => {
    const vLeaf = leaf(validator.address, 'v');
    await identity.setValidatorMerkleRoot(vLeaf);
    const badProof = [ethers.id('bad')];
    await expect(
      identity.verifyValidator(validator.address, 'v', badProof)
    ).to.not.emit(identity, 'OwnershipVerified');
    expect(
      (
        await identity.verifyValidator.staticCall(
          validator.address,
          'v',
          badProof
        )
      )[0]
    ).to.equal(false);
  });

  it('removes validator privileges after subdomain transfer and allows override', async () => {
    const node = namehash(root, 'v');
    await wrapper.setOwner(ethers.toBigInt(node), validator.address);
    await resolver.setAddr(node, validator.address);
    await validation.setValidatorPool([
      validator.address,
      v2.address,
      v3.address,
    ]);
    await validation.setValidatorSubdomains([validator.address], ['v']);

    await stakeManager.setStake(validator.address, 1, ethers.parseEther('1'));

    const job = {
      employer: owner.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(1, job);
    await finalizeValidatorSelection(validation, 1, {
      contributors: [validator, v2],
      entropy: 11111,
    });

    // transfer ENS ownership
    await wrapper.setOwner(ethers.toBigInt(node), other.address);
    await expect(
      validation.connect(validator).commitValidation(1, ethers.id('h'), 'v', [])
    ).to.be.revertedWithCustomError(validation, 'UnauthorizedValidator');

    // non-owner cannot override
    await expect(
      identity.connect(other).addAdditionalValidator(validator.address)
    ).to.be.revertedWithCustomError(identity, 'OwnableUnauthorizedAccount');

    // owner override and commit succeeds
    await identity.addAdditionalValidator(validator.address);
    await expect(
      validation.connect(validator).commitValidation(1, ethers.id('h'), 'v', [])
    )
      .to.emit(validation, 'ValidatorIdentityVerified')
      .withArgs(validator.address, node, 'v', false, false)
      .and.to.emit(validation, 'ValidationCommitted')
      .withArgs(1, validator.address, ethers.id('h'), 'v');
  });

  it('skips blacklisted validators', async () => {
    const node = namehash(root, 'v');
    await wrapper.setOwner(ethers.toBigInt(node), validator.address);
    await resolver.setAddr(node, validator.address);
    await validation.setValidatorPool([
      validator.address,
      v2.address,
      v3.address,
    ]);
    await validation.setValidatorSubdomains([validator.address], ['v']);
    await stakeManager.setStake(validator.address, 1, ethers.parseEther('1'));
    await reputation.setBlacklist(validator.address, true);
    const job = {
      employer: owner.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(1, job);
    await expect(
      finalizeValidatorSelection(validation, 1, {
        contributors: [validator, v2],
        entropy: 22222,
      })
    ).to.be.revertedWithCustomError(validation, 'InsufficientValidators');
  });
});
