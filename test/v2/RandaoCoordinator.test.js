import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const DEPOSIT = 1n;

function tagFromNumber(n) {
  return ethers.zeroPadValue(ethers.toBeHex(n), 32);
}

describe("RandaoCoordinator", function () {
  it("aggregates revealed secrets", async () => {
    const [a, b] = await ethers.getSigners();
    const Randao = await ethers.getContractFactory(
      "contracts/v2/RandaoCoordinator.sol:RandaoCoordinator"
    );
    const randao = await Randao.deploy(10, 10, DEPOSIT);
    const tag = tagFromNumber(1);
    const s1 = 1n;
    const c1 = ethers.keccak256(
      ethers.solidityPacked(["address", "bytes32", "uint256"], [
        a.address,
        tag,
        s1,
      ])
    );
    await randao.connect(a).commit(tag, c1, { value: DEPOSIT });
    const s2 = 2n;
    const c2 = ethers.keccak256(
      ethers.solidityPacked(["address", "bytes32", "uint256"], [
        b.address,
        tag,
        s2,
      ])
    );
    await randao.connect(b).commit(tag, c2, { value: DEPOSIT });
    await time.increase(11);
    await randao.connect(a).reveal(tag, s1);
    await randao.connect(b).reveal(tag, s2);
    await time.increase(11);
    const r = await randao.random(tag);
    expect(r).to.equal(s1 ^ s2);
    const bal = await ethers.provider.getBalance(await randao.getAddress());
    expect(bal).to.equal(0n);
  });

  it("penalizes missing reveals", async () => {
    const [a, b] = await ethers.getSigners();
    const Randao = await ethers.getContractFactory(
      "contracts/v2/RandaoCoordinator.sol:RandaoCoordinator"
    );
    const randao = await Randao.deploy(10, 10, DEPOSIT);
    const tag = tagFromNumber(2);
    const s1 = 3n;
    const c1 = ethers.keccak256(
      ethers.solidityPacked(["address", "bytes32", "uint256"], [
        a.address,
        tag,
        s1,
      ])
    );
    await randao.connect(a).commit(tag, c1, { value: DEPOSIT });
    const s2 = 4n;
    const c2 = ethers.keccak256(
      ethers.solidityPacked(["address", "bytes32", "uint256"], [
        b.address,
        tag,
        s2,
      ])
    );
    await randao.connect(b).commit(tag, c2, { value: DEPOSIT });
    await time.increase(11);
    await randao.connect(a).reveal(tag, s1);
    // b does not reveal
    await time.increase(11);
    const r = await randao.random(tag);
    expect(r).to.equal(s1);
    const bal = await ethers.provider.getBalance(await randao.getAddress());
    expect(bal).to.equal(DEPOSIT);
  });
});

describe("ValidationModule fairness", function () {
  it("uses Randao randomness for validator selection", async () => {
    const [owner, v1, v2] = await ethers.getSigners();
    const Token = await ethers.getContractFactory(
      "contracts/test/AGIALPHAToken.sol:AGIALPHAToken"
    );
    const token = await Token.deploy();
    const mint = ethers.parseEther("10");
    await token.mint(v1.address, mint);
    await token.mint(v2.address, mint);

    const Tax = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const tax = await Tax.deploy("", "");
    const Job = await ethers.getContractFactory(
      "contracts/v2/mocks/JobRegistryAckStub.sol:JobRegistryAckStub"
    );
    const job = await Job.deploy(await tax.getAddress());

    const Stake = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    const stake = await Stake.deploy(
      await token.getAddress(),
      0,
      0,
      0,
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stake.setModules(await job.getAddress(), ethers.ZeroAddress);

    const Identity = await ethers.getContractFactory(
      "contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock"
    );
    const identity = await Identity.deploy();

    const Randao = await ethers.getContractFactory(
      "contracts/v2/RandaoCoordinator.sol:RandaoCoordinator"
    );
    const randao = await Randao.deploy(10, 10, DEPOSIT);

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    const validation = await Validation.deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
      1,
      1,
      1,
      2,
      []
    );

    await validation.setIdentityRegistry(await identity.getAddress());
    await validation.setValidatorPool([v1.address, v2.address]);
    await validation.setRandaoCoordinator(await randao.getAddress());
    await validation.setValidatorsPerJob(1);
    await validation.setParameters(1, 1, 1, 50, 50);
    await validation.setJobRegistry(await job.getAddress());
    await stake.setValidationModule(await validation.getAddress());

    const stakeAmt = ethers.parseEther("1");
    await token.connect(v1).approve(await stake.getAddress(), stakeAmt);
    await token.connect(v2).approve(await stake.getAddress(), stakeAmt);
    await stake.connect(v1).acknowledgeAndDeposit(1, stakeAmt);
    await stake.connect(v2).acknowledgeAndDeposit(1, stakeAmt);

    // First selection -> choose v1
    const tag1 = tagFromNumber(1);
    const secret1 = 1n;
    const commit1 = ethers.keccak256(
      ethers.solidityPacked(["address", "bytes32", "uint256"], [
        owner.address,
        tag1,
        secret1,
      ])
    );
    await randao.commit(tag1, commit1, { value: DEPOSIT });
    await time.increase(11);
    await randao.reveal(tag1, secret1);
    await time.increase(11);
    await validation.selectValidators(1n, 0);
    let selected = await validation.validators(1n);
    expect(selected[0]).to.equal(v1.address);

    // Second selection -> choose v2
    const tag2 = tagFromNumber(2);
    const secret2 = stakeAmt + 1n;
    const commit2 = ethers.keccak256(
      ethers.solidityPacked(["address", "bytes32", "uint256"], [
        owner.address,
        tag2,
        secret2,
      ])
    );
    await randao.commit(tag2, commit2, { value: DEPOSIT });
    await time.increase(11);
    await randao.reveal(tag2, secret2);
    await time.increase(11);
    await validation.selectValidators(2n, 0);
    selected = await validation.validators(2n);
    expect(selected[0]).to.equal(v2.address);
  });
});
