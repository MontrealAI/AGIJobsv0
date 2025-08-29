const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Validator selection with large pool", function () {
  let validation, stake, identity, jobRegistry;

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

  });

  it("benchmarks gas usage across pool sizes", async () => {
    const poolSizes = [10, 50, 200, 500];
    let jobId = 1;
    for (const poolSize of poolSizes) {
      const validators = [];
      for (let i = 0; i < poolSize; i++) {
        const addr = ethers.Wallet.createRandom().address;
        validators.push(addr);
        await stake.setStake(addr, 1, ethers.parseEther("1"));
        await identity.addAdditionalValidator(addr);
      }
      await validation.setValidatorPool(validators);
      await validation.setValidatorsPerJob(3);
      await validation.setValidatorPoolSampleSize(Math.min(poolSize, 50));
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
      await jobRegistry.setJob(jobId, jobStruct);
      await validation.selectValidators(jobId, 12345);
      await ethers.provider.send("evm_mine", []);
      const tx = await validation.selectValidators(jobId++, 0);
      const receipt = await tx.wait();
      console.log(`pool size ${poolSize}: ${receipt.gasUsed}`);
      expect(receipt.gasUsed).to.be.lt(6000000n);
      const ev = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
      );
      expect(ev.args[1].length).to.equal(3);
    }
  });

  it("reverts when validator pool exceeds max size", async () => {
    const maxSize = 50;
    await validation.setMaxValidatorPoolSize(maxSize);
    const poolSize = maxSize + 1;
    const validators = [];
    for (let i = 0; i < poolSize; i++) {
      const addr = ethers.Wallet.createRandom().address;
      validators.push(addr);
    }
    await expect(
      validation.setValidatorPool(validators)
    ).to.be.revertedWith("pool limit");
  });
});

