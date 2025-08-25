const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Validator selection with large pool", function () {
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
  });

  it("samples large pools within gas limits", async () => {
    const poolSize = 200;
    const validators = [];
    for (let i = 0; i < poolSize; i++) {
      const addr = ethers.Wallet.createRandom().address;
      validators.push(addr);
      await stake.setStake(addr, 1, ethers.parseEther("1"));
    }
    await validation.setValidatorPool(validators);
    await validation.setValidatorsPerJob(3);
    await validation.setValidatorPoolSampleSize(50);

    const tx = await validation.selectValidators(1);
    const receipt = await tx.wait();
    expect(receipt.gasUsed).to.be.lt(5000000n);
    const ev = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    );
    expect(ev.args[1].length).to.equal(3);
  });
});

