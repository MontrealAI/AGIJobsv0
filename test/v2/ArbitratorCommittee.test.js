const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const FEE = 10n ** 18n;

describe('ArbitratorCommittee', function () {
  async function setup() {
    const [owner, employer, agent, v1, v2, v3] = await ethers.getSigners();

    const { AGIALPHA } = require('../../scripts/constants');
    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    const token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );

    const Stake = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    const stake = await Stake.deploy(
      0,
      0,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stake.waitForDeployment();

    const JobMock = await ethers.getContractFactory('MockJobRegistry');
    const registry = await JobMock.deploy();
    await registry.waitForDeployment();
    await registry.setStakeManager(await stake.getAddress());
    await stake.setJobRegistry(await registry.getAddress());

    const Validation = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    const validation = await Validation.deploy();
    await validation.setValidators([v1.address, v2.address, v3.address]);
    await registry.setValidationModule(await validation.getAddress());

    const Dispute = await ethers.getContractFactory(
      'contracts/v2/modules/DisputeModule.sol:DisputeModule'
    );
    const dispute = await Dispute.deploy(
      await registry.getAddress(),
      FEE,
      10n,
      ethers.ZeroAddress,
      owner.address
    );
    await dispute.waitForDeployment();
    await registry.setDisputeModule(await dispute.getAddress());
    await stake.setDisputeModule(await dispute.getAddress());

    const Committee = await ethers.getContractFactory(
      'contracts/v2/ArbitratorCommittee.sol:ArbitratorCommittee'
    );
    const committee = await Committee.deploy(
      await registry.getAddress(),
      await dispute.getAddress()
    );
    await dispute.setCommittee(await committee.getAddress());

    await token.mint(agent.address, FEE);
    await token.connect(agent).approve(await stake.getAddress(), FEE);
    await token.mint(employer.address, FEE);
    await token.connect(employer).approve(await stake.getAddress(), FEE);

    await registry.setJob(1, {
      employer: employer.address,
      agent: agent.address,
      reward: 0,
      stake: 0,
      success: false,
      status: 4,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    });

    return {
      owner,
      employer,
      agent,
      v1,
      v2,
      v3,
      token,
      stake,
      registry,
      validation,
      dispute,
      committee,
    };
  }

  it('handles commit-reveal voting and finalization', async () => {
    const { owner, committee, dispute, registry, agent, employer, v1, v2, v3 } =
      await setup();

    await committee.setCommitRevealWindows(30n, 30n);

    await expect(committee.connect(agent).pause()).to.be.revertedWith(
      'owner or pauser only'
    );
    await expect(committee.pause())
      .to.emit(committee, 'Paused')
      .withArgs(owner.address);
    const evidence = ethers.id('evidence');
    const reason = 'ipfs://evidence';
    await expect(
      registry.connect(agent).dispute(1, evidence, reason)
    ).to.be.revertedWithCustomError(committee, 'EnforcedPause');
    await expect(committee.unpause())
      .to.emit(committee, 'Unpaused')
      .withArgs(owner.address);

    await expect(registry.connect(agent).dispute(1, evidence, reason))
      .to.emit(dispute, 'DisputeRaised')
      .withArgs(1, agent.address, evidence, reason);

    const fakeCommit = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'uint256', 'bool', 'uint256'],
        [employer.address, 1, true, 4n]
      )
    );
    await expect(
      committee.connect(employer).commit(1, fakeCommit)
    ).to.be.revertedWith('not juror');
    await expect(
      committee.connect(employer).reveal(1, true, 4n)
    ).to.be.revertedWith('not juror');

    const s1 = 1n,
      s2 = 2n,
      s3 = 3n;
    const c1 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'uint256', 'bool', 'uint256'],
        [v1.address, 1, true, s1]
      )
    );
    const c2 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'uint256', 'bool', 'uint256'],
        [v2.address, 1, true, s2]
      )
    );
    const c3 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'uint256', 'bool', 'uint256'],
        [v3.address, 1, false, s3]
      )
    );

    await committee.pause();
    await expect(
      committee.connect(v1).commit(1, c1)
    ).to.be.revertedWithCustomError(committee, 'EnforcedPause');
    await committee.unpause();
    await committee.connect(v1).commit(1, c1);
    await committee.connect(v2).commit(1, c2);
    await committee.connect(v3).commit(1, c3);

    await time.increase(40n);

    await committee.pause();
    await expect(
      committee.connect(v1).reveal(1, true, s1)
    ).to.be.revertedWithCustomError(committee, 'EnforcedPause');
    await committee.unpause();
    await committee.connect(v1).reveal(1, true, s1);
    await committee.connect(v2).reveal(1, true, s2);
    await committee.connect(v3).reveal(1, false, s3);

    await time.increase(10n);

    await committee.pause();
    await expect(committee.finalize(1)).to.be.revertedWithCustomError(
      committee,
      'EnforcedPause'
    );
    await committee.unpause();
    await expect(committee.finalize(1))
      .to.emit(dispute, 'DisputeResolved')
      .withArgs(1, await committee.getAddress(), true);
  });

  it('handles deadline expiry and partial reveals', async () => {
    const { committee, dispute, registry, agent, employer, v1, v2, v3 } =
      await setup();

    await committee.setCommitRevealWindows(3n, 2n);

    const evidence = ethers.id('evidence');
    const reason = 'ipfs://evidence';
    await registry.connect(agent).dispute(1, evidence, reason);

    const s1 = 1n,
      s2 = 2n;
    const c1 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'uint256', 'bool', 'uint256'],
        [v1.address, 1, true, s1]
      )
    );
    const c2 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'uint256', 'bool', 'uint256'],
        [v2.address, 1, true, s2]
      )
    );

    await committee.connect(v1).commit(1, c1);
    await committee.connect(v2).commit(1, c2);

    await time.increase(2n);

    await committee.connect(v1).reveal(1, true, s1);

    await time.increase(2n);

    await time.increase(10n);

    await expect(committee.finalize(1))
      .to.emit(dispute, 'DisputeResolved')
      .withArgs(1, await committee.getAddress(), true);
  });

  it('slashes absentee jurors and emits events', async () => {
    const {
      committee,
      dispute,
      registry,
      agent,
      employer,
      v1,
      v2,
      token,
      stake,
    } = await setup();

    await committee.setCommitRevealWindows(3n, 2n);
    await committee.setAbsenteeSlash(FEE);

    for (const juror of [v1, v2]) {
      await token.mint(juror.address, FEE);
      await token.connect(juror).approve(await stake.getAddress(), FEE);
      await stake.connect(juror).depositStake(1, FEE);
    }

    const evidence = ethers.id('evidence');
    const reason = 'ipfs://evidence';
    await registry.connect(agent).dispute(1, evidence, reason);

    const s1 = 1n,
      s2 = 2n;
    const c1 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'uint256', 'bool', 'uint256'],
        [v1.address, 1, true, s1]
      )
    );
    const c2 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'uint256', 'bool', 'uint256'],
        [v2.address, 1, true, s2]
      )
    );

    await committee.connect(v1).commit(1, c1);
    await committee.connect(v2).commit(1, c2);

    await time.increase(2n);

    await committee.connect(v1).reveal(1, true, s1);

    await time.increase(3n);
    await time.increase(10n);

    await expect(committee.finalize(1))
      .to.emit(dispute, 'JurorSlashed')
      .withArgs(v2.address, FEE, employer.address);

    expect(await stake.stakeOf(v2.address, 1)).to.equal(0n);
  });
});
