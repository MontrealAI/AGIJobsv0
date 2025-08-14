const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PlatformIncentives acknowledge", function () {
  it("acknowledgeStakeAndActivate records acknowledgement", async () => {
    const [owner, operator, treasury] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    const token = await Token.deploy();

    const Stake = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    const stakeManager = await Stake.deploy(
      await token.getAddress(),
      0,
      100,
      0,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await stakeManager.connect(owner).setMinStake(0);

    const Rep = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    const reputation = await Rep.deploy();
    await reputation.setStakeManager(await stakeManager.getAddress());

    const Registry = await ethers.getContractFactory(
      "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
    );
    const platformRegistry = await Registry.deploy(
      await stakeManager.getAddress(),
      await reputation.getAddress(),
      0
    );

    const Router = await ethers.getContractFactory(
      "contracts/v2/modules/JobRouter.sol:JobRouter"
    );
    const jobRouter = await Router.deploy(await platformRegistry.getAddress());

    const Incentives = await ethers.getContractFactory(
      "contracts/v2/PlatformIncentives.sol:PlatformIncentives"
    );
    const incentives = await Incentives.deploy(
      await stakeManager.getAddress(),
      await platformRegistry.getAddress(),
      await jobRouter.getAddress()
    );
    await platformRegistry.setRegistrar(await incentives.getAddress(), true);
    await jobRouter.setRegistrar(await incentives.getAddress(), true);

    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      []
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const policy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry.connect(owner).setTaxPolicy(await policy.getAddress());
    await jobRegistry
      .connect(owner)
      .setAcknowledger(await incentives.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());

    const STAKE = 1e6;
    await token.mint(operator.address, STAKE);
    await token
      .connect(operator)
      .approve(await stakeManager.getAddress(), STAKE);

    await incentives.connect(operator).acknowledgeStakeAndActivate(STAKE);
    const version = await jobRegistry.taxPolicyVersion();
    expect(await jobRegistry.taxAcknowledgedVersion(operator.address)).to.equal(
      version
    );
  });
});

