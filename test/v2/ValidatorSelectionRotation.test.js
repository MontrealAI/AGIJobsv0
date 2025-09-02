const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Validator selection rotating strategy", function () {
  let validation, stake, identity;
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
      await validation.selectValidators(j + 1, 0);
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
    const tx = await validation.selectValidators(1, 0);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorPoolRotationUpdated"
    );
    expect(event).to.not.be.undefined;

    const blockNumber = receipt.blockNumber;
    const block = await ethers.provider.getBlock(blockNumber);
    const prevBlock = await ethers.provider.getBlock(blockNumber - 1);
    const prevPrevBlock = await ethers.provider.getBlock(blockNumber - 2);

    let randao = block.prevRandao ? ethers.toBigInt(block.prevRandao) : 0n;
    if (randao === 0n) {
      randao = ethers.toBigInt(
        ethers.keccak256(
          ethers.solidityPacked(
            ["bytes32", "bytes32", "address"],
            [prevBlock.hash, prevPrevBlock.hash, owner.address]
          )
        )
      );
    }

    const bhash = prevBlock.hash;
    const offset =
      ethers.toBigInt(
        ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [randao, bhash])
        )
      ) % BigInt(poolSize);

    const expectedRotation =
      (offset + BigInt(sampleSize)) % BigInt(poolSize);
    expect(event.args[0]).to.equal(expectedRotation);
  });
});
