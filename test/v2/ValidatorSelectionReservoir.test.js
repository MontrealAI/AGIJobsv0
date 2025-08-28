const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Validator selection reservoir strategy", function () {
  let validation, stake, identity;
  let validators;
  const poolSize = 150;
  const sampleSize = 50;
  const committeeSize = 3;

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
      3,
      10,
      []
    );
    await validation.waitForDeployment();
    await validation.setIdentityRegistry(await identity.getAddress());
    await validation.setValidatorPoolSampleSize(sampleSize);
    // Use reservoir sampling strategy
    await validation.setSelectionStrategy(1);

    validators = [];
    for (let i = 0; i < poolSize; i++) {
      const addr = ethers.Wallet.createRandom().address;
      validators.push(addr);
      await stake.setStake(addr, 1, ethers.parseEther("1"));
      await identity.addAdditionalValidator(addr);
    }
    await validation.setValidatorPool(validators);
    await validation.setValidatorsPerJob(committeeSize);
  });

  it("selects uniformly when pool exceeds sample size", async () => {
    const counts = {};
    const iterations = 30;
    for (let i = 0; i < iterations; i++) {
      await validation.selectValidators(i + 1, i + 12345);
      await ethers.provider.send("evm_mine", []);
      await validation.selectValidators(i + 1, 0);
      const selected = await validation.validators(i + 1);
      for (const v of selected) {
        counts[v] = (counts[v] || 0) + 1;
      }
    }
    const total = iterations * committeeSize;
    let firstHalf = 0;
    for (let i = 0; i < poolSize / 2; i++) {
      firstHalf += counts[validators[i]] || 0;
    }
    const secondHalf = total - firstHalf;
    expect(firstHalf).to.be.closeTo(total / 2, total * 0.3);
    expect(secondHalf).to.be.closeTo(total / 2, total * 0.3);
  });
});

