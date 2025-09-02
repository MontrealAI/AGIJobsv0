const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Validator selection rotating strategy", function () {
  let validation, stake, identity, other;
  const poolSize = 10;
  const sampleSize = 3;

  beforeEach(async () => {
    const [_, o] = await ethers.getSigners();
    other = o;

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
      await validation.selectValidators(j + 1, 0);
      await ethers.provider.send("evm_mine", []);
      await validation.connect(other).selectValidators(j + 1, 0);
      const rotation = await validation.validatorPoolRotation();
      const start = Number(
        (rotation + BigInt(poolSize) - BigInt(sampleSize)) % BigInt(poolSize)
      );
      starts.add(start);
    }
    expect(starts.size).to.be.gt(1);
  });

  it("emits rotation update event with expected value", async () => {
    const [owner] = await ethers.getSigners();
    await validation.selectValidators(1, 0);
    await ethers.provider.send("evm_mine", []);
    const tx = await validation.connect(other).selectValidators(1, 0);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorPoolRotationUpdated"
    );
    expect(event).to.not.be.undefined;
    const rotation = await validation.validatorPoolRotation();
    expect(event.args[0]).to.equal(rotation);
  });
});
