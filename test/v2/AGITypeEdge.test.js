const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeManager AGIType bonuses", function () {
  let owner, employer, agent, registrySigner;
  let token, stakeManager, jobRegistry;
  let nft1, nft2, malicious;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();

    const { AGIALPHA } = require("../../scripts/constants");
    token = await ethers.getContractAt("contracts/v2/AGIALPHAToken.sol:AGIALPHAToken", AGIALPHA);

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(0);

    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(agent).acknowledgeTaxPolicy();

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [
      registryAddr,
      "0x56BC75E2D63100000",
    ]);
    registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    const NFT = await ethers.getContractFactory(
      "contracts/legacy/MockERC721.sol:MockERC721"
    );
    nft1 = await NFT.deploy();
    nft2 = await NFT.deploy();

    const Mal = await ethers.getContractFactory(
      "contracts/legacy/MaliciousERC721.sol:MaliciousERC721"
    );
    malicious = await Mal.deploy();

    await token.mint(employer.address, 1000);
  });

  it("applies highest AGIType bonus", async () => {
    await stakeManager
      .connect(owner)
      .addAGIType(await nft1.getAddress(), 150);
    await stakeManager
      .connect(owner)
      .addAGIType(await nft2.getAddress(), 175);
    await nft1.mint(agent.address);
    await nft2.mint(agent.address);

    const jobId = ethers.encodeBytes32String("job1");
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), 200);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, 200);

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(jobId, agent.address, 100)
    )
      .to.emit(stakeManager, "StakeReleased")
      .withArgs(jobId, agent.address, 175);

    expect(await token.balanceOf(agent.address)).to.equal(175n);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(25n);
  });

  it("ignores NFTs with failing balanceOf", async () => {
    await stakeManager
      .connect(owner)
      .addAGIType(await malicious.getAddress(), 150);

    const jobId = ethers.encodeBytes32String("job2");
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), 100);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, 100);

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(jobId, agent.address, 100)
    )
      .to.emit(stakeManager, "StakeReleased")
      .withArgs(jobId, agent.address, 100);
  });

  it("reverts when bonus payout exceeds escrow", async () => {
    await stakeManager
      .connect(owner)
      .addAGIType(await nft1.getAddress(), 150);
    await nft1.mint(agent.address);

    const jobId = ethers.encodeBytes32String("job3");
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), 100);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, 100);

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(jobId, agent.address, 100)
    ).to.be.revertedWith("escrow");
  });
});

