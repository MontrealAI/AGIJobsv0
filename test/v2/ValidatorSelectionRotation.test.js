const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Validator selection rotating strategy", function () {
  let validation, stake, identity, jobRegistry;
  const poolSize = 10;
  const sampleSize = 3;

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

    const Job = await ethers.getContractFactory("MockJobRegistry");
    jobRegistry = await Job.deploy();
    await jobRegistry.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stake.getAddress(),
      1,
      1,
      3,
      10,
      []
    );
    await validation.waitForDeployment();
    await validation.setIdentityRegistry(await identity.getAddress());
    await validation.setSelectionStrategy(0);
    await validation.setValidatorPoolSampleSize(sampleSize);

    const validators = [];
    for (let i = 0; i < poolSize; i++) {
      const addr = ethers.Wallet.createRandom().address;
      validators.push(addr);
      await stake.setStake(addr, 1, ethers.parseEther("1"));
      await identity.addAdditionalValidator(addr);
    }
    await validation.setValidatorPool(validators);
  });

  it("randomizes rotation start index between runs", async () => {
    const starts = new Set();
    for (let j = 0; j < 5; j++) {
      const jobStruct = {
        employer: ethers.ZeroAddress,
        agent: ethers.ZeroAddress,
        reward: 0,
        stake: 0,
        success: false,
        status: 3,
        uriHash: ethers.ZeroHash,
        resultHash: ethers.ZeroHash,
      };
      await jobRegistry.setJob(j + 1, jobStruct);
      await validation.selectValidators(j + 1, 0);
      await ethers.provider.send("evm_mine", []);
      await validation.selectValidators(j + 1, 0);
      const rotation = await validation.validatorPoolRotation();
      const start = Number(
        (rotation + BigInt(poolSize) - BigInt(sampleSize)) % BigInt(poolSize)
      );
      starts.add(start);
    }
    expect(starts.size).to.be.gt(1);
  });
});
