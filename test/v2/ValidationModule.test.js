const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ValidationModule V2", function () {
  let owner, employer, v1, v2, v3;
  let validation, stakeManager, jobRegistry, reputation;
  const coder = ethers.AbiCoder.defaultAbiCoder();

  beforeEach(async () => {
    [owner, employer, v1, v2, v3] = await ethers.getSigners();

    const StakeMock = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();

    const RepMock = await ethers.getContractFactory("MockReputationEngine");
    reputation = await RepMock.deploy();
    await reputation.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      owner.address
    );
    await validation.waitForDeployment();
    await validation
      .connect(owner)
      .setReputationEngine(await reputation.getAddress());

    // set parameters: commit 60s, reveal 60s, validators per job 2
    await validation
      .connect(owner)
      .setParameters(60, 60, 2);

    // validator stakes and pool
    await stakeManager.setStake(v1.address, 1, ethers.parseEther("100"));
    await stakeManager.setStake(v2.address, 1, ethers.parseEther("50"));
    await stakeManager.setStake(v3.address, 1, ethers.parseEther("10"));

    await validation
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address]);

    // setup job
    const jobStruct = {
      employer: employer.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 0,
    };
    await jobRegistry.setJob(1, jobStruct);
  });

  async function advance(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  it("selects deterministic stake-weighted validators", async () => {
    const tx = await validation.selectValidators(1);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    );
    const selected = event.args[1];

    const prevBlock = await ethers.provider.getBlock(receipt.blockNumber - 1);
    const blockHash = prevBlock.hash;

    const pool = [v1.address, v2.address, v3.address];
    const stakes = [
      ethers.parseEther("100"),
      ethers.parseEther("50"),
      ethers.parseEther("10"),
    ];

    let seed = ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "uint256", "bytes32"],
        [blockHash, 1n, ethers.ZeroHash]
      )
    );
    let total = stakes.reduce((a, b) => a + b, 0n);
    const expected = [];
    const remainingPool = [...pool];
    const remainingStakes = [...stakes];
    for (let i = 0; i < 2; i++) {
      seed = ethers.keccak256(
        ethers.solidityPacked(["bytes32", "uint256"], [seed, BigInt(i)])
      );
      const r = BigInt(seed) % total;
      let cum = 0n;
      let idx = 0;
      for (; idx < remainingPool.length; idx++) {
        cum += remainingStakes[idx];
        if (r < cum) break;
      }
      expected.push(remainingPool[idx]);
      const removedStake = remainingStakes[idx];
      total -= removedStake;
      const last = remainingPool.length - 1;
      remainingPool[idx] = remainingPool[last];
      remainingStakes[idx] = remainingStakes[last];
      remainingPool.pop();
      remainingStakes.pop();
    }

    expect(selected).to.deep.equal(expected);
  });

  it("does not slash honest validators", async () => {
    const tx = await validation.selectValidators(1);
    const receipt = await tx.wait();
    const selected = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    ).args[1];
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt2"));
    const commit1 = ethers.keccak256(
      coder.encode(["bool", "bytes32"], [true, salt1])
    );
    const commit2 = ethers.keccak256(
      coder.encode(["bool", "bytes32"], [true, salt2])
    );
    const signerMap = {
      [v1.address.toLowerCase()]: v1,
      [v2.address.toLowerCase()]: v2,
      [v3.address.toLowerCase()]: v3,
    };
    await (
      await validation
        .connect(signerMap[selected[0].toLowerCase()])
        .commitVote(1, commit1)
    ).wait();
    await (
      await validation
        .connect(signerMap[selected[1].toLowerCase()])
        .commitVote(1, commit2)
    ).wait();
    await advance(61);
    await validation
      .connect(signerMap[selected[0].toLowerCase()])
      .revealVote(1, true, salt1);
    await validation
      .connect(signerMap[selected[1].toLowerCase()])
      .revealVote(1, true, salt2);
    await advance(61);
    expect(await validation.tally.staticCall(1)).to.equal(true);
    await validation.tally(1);
    for (const addr of selected) {
      const stake = await stakeManager.stakeOf(addr, 1);
      const expectedStake =
        addr.toLowerCase() === v1.address.toLowerCase()
          ? ethers.parseEther("100")
          : addr.toLowerCase() === v2.address.toLowerCase()
          ? ethers.parseEther("50")
          : ethers.parseEther("10");
      expect(stake).to.equal(expectedStake);
      expect(await reputation.reputationOf(addr)).to.equal(1n);
    }
  });

  it("slashes validator voting against majority", async () => {
    const tx = await validation.selectValidators(1);
    const receipt = await tx.wait();
    const selected = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    ).args[1];
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt2"));
    const commit1 = ethers.keccak256(
      coder.encode(["bool", "bytes32"], [true, salt1])
    );
    const commit2 = ethers.keccak256(
      coder.encode(["bool", "bytes32"], [false, salt2])
    );
    const signerMap = {
      [v1.address.toLowerCase()]: v1,
      [v2.address.toLowerCase()]: v2,
      [v3.address.toLowerCase()]: v3,
    };
    await (
      await validation
        .connect(signerMap[selected[0].toLowerCase()])
        .commitVote(1, commit1)
    ).wait();
    await (
      await validation
        .connect(signerMap[selected[1].toLowerCase()])
        .commitVote(1, commit2)
    ).wait();
    await advance(61);
    const stake0 = await stakeManager.stakeOf(selected[0], 1);
    const stake1 = await stakeManager.stakeOf(selected[1], 1);
    await validation
      .connect(signerMap[selected[0].toLowerCase()])
      .revealVote(1, true, salt1);
    await validation
      .connect(signerMap[selected[1].toLowerCase()])
      .revealVote(1, false, salt2);
    await advance(61);
    await validation.tally(1);
    const slashed = stake0 >= stake1 ? selected[1] : selected[0];
    const winner = slashed === selected[0] ? selected[1] : selected[0];
    const slashedStakeBefore = stake0 >= stake1 ? stake1 : stake0;
    expect(await stakeManager.stakeOf(slashed, 1)).to.equal(
      slashedStakeBefore / 2n
    );
    expect(await reputation.reputationOf(winner)).to.equal(1n);
    expect(await reputation.reputationOf(slashed)).to.equal(0n);
  });
});
