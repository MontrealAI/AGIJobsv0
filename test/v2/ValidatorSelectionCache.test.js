const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Validator selection cache", function () {
  let validation, stake, identity;

  beforeEach(async () => {
    const StakeMock = await ethers.getContractFactory("MockStakeManager");
    stake = await StakeMock.deploy();
    await stake.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      "contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock"
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await identity.setClubRootNode(ethers.ZeroHash);
    await identity.setAgentRootNode(ethers.ZeroHash);

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
      1,
      1,
      1,
      10,
      []
    );
    await validation.waitForDeployment();
    await validation.setIdentityRegistry(await identity.getAddress());

    const validators = [];
    for (let i = 0; i < 3; i++) {
      const addr = ethers.Wallet.createRandom().address;
      validators.push(addr);
      await stake.setStake(addr, 1, ethers.parseEther("1"));
      await identity.addAdditionalValidator(addr);
    }
    await validation.setValidatorPool(validators);
    await validation.setValidatorsPerJob(3);
    await validation.setValidatorPoolSampleSize(3);
  });

  it("skips repeat ENS checks when cached", async () => {
    const tx1 = await validation.selectValidators(1);
    const gas1 = (await tx1.wait()).gasUsed;

    const tx2 = await validation.selectValidators(2);
    const gas2 = (await tx2.wait()).gasUsed;

    expect(gas2).to.be.lt(gas1);
  });
});
