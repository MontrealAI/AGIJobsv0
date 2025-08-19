const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

function buildTree(addresses) {
  const leaves = addresses.map((a) =>
    ethers.solidityPackedKeccak256(["address"], [a])
  );
  const layers = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 === prev.length) {
        next.push(prev[i]);
      } else {
        const pair = [prev[i], prev[i + 1]].sort();
        next.push(ethers.keccak256(ethers.concat(pair)));
      }
    }
    layers.push(next);
  }
  const root = layers[layers.length - 1][0];
  function getProof(address) {
    const leaf = ethers.solidityPackedKeccak256(["address"], [address]);
    let idx = layers[0].indexOf(leaf);
    if (idx === -1) throw new Error("address not found");
    const proof = [];
    for (let level = 0; level < layers.length - 1; level++) {
      const layer = layers[level];
      const pairIndex = idx ^ 1;
      if (pairIndex < layer.length) {
        proof.push(layer[pairIndex]);
      }
      idx = Math.floor(idx / 2);
    }
    return proof;
  }
  return { root, getProof };
}

async function deployFixture() {
  const [owner, employer, agent, v1, v2, outsider] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy();
  await token.waitForDeployment();
  await token.mint(employer.address, ethers.parseEther("1000"));
  await token.mint(agent.address, ethers.parseEther("100"));
  await token.mint(v1.address, ethers.parseEther("100"));
  await token.mint(v2.address, ethers.parseEther("100"));
  await token.mint(outsider.address, ethers.parseEther("100"));
  const ENSMock = await ethers.getContractFactory("MockENS");
  const ens = await ENSMock.deploy();
  const Wrapper = await ethers.getContractFactory("MockNameWrapper");
  const wrapper = await Wrapper.deploy();
  const Manager = await ethers.getContractFactory("AGIJobManagerV1");
  const manager = await Manager.deploy(
    await token.getAddress(),
    "ipfs://",
    await ens.getAddress(),
    await wrapper.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash,
    ethers.ZeroHash,
    ethers.ZeroHash
  );
  await manager.waitForDeployment();

  const agentTree = buildTree([agent.address]);
  const validatorTree = buildTree([v1.address, v2.address]);
  const agentRootNode = ethers.id("agentRoot");
  const clubRootNode = ethers.id("clubRoot");
  await manager.setAgentRootNode(agentRootNode);
  await manager.setClubRootNode(clubRootNode);
  await manager.setAgentMerkleRoot(agentTree.root);
  await manager.setValidatorMerkleRoot(validatorTree.root);
  await manager.setValidatorPool([v1.address, v2.address]);

  await manager.setCommitRevealWindows(2, 3);
  await manager.setReviewWindow(10);
  await manager.setRequiredValidatorApprovals(1);
  await manager.setRequiredValidatorDisapprovals(2);
  await manager.setValidatorsPerJob(2);
  await manager.setValidatorSlashingPercentage(1000);
  await manager.setAgentSlashingPercentage(1000);
  await manager.addModerator(owner.address);

  for (const signer of [agent, v1, v2, employer, outsider]) {
    await manager.connect(signer).acceptTerms("ipfs://terms");
  }

  const stake = ethers.parseEther("10");
  await token.connect(agent).approve(await manager.getAddress(), stake);
  await manager.connect(agent).stakeAgent(stake);
  await token.connect(v1).approve(await manager.getAddress(), stake);
  await manager.connect(v1).stake(stake);
  await token.connect(v2).approve(await manager.getAddress(), stake);
  await manager.connect(v2).stake(stake);
  await token.connect(outsider).approve(await manager.getAddress(), stake);
  await manager.connect(outsider).stakeAgent(stake);

  return {
    token,
    manager,
    owner,
    employer,
    agent,
    v1,
    v2,
    outsider,
    proofs: {
      agent: agentTree.getProof(agent.address),
      v1: validatorTree.getProof(v1.address),
      v2: validatorTree.getProof(v2.address),
    },
  };
}

describe("Extended integration", function () {
  it("happy path with commit/reveal and payout", async function () {
    const { token, manager, employer, agent, v1, v2, proofs } =
      await deployFixture();
    const payout = ethers.parseEther("100");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash", payout, 1000, "details");
    await manager.connect(agent).applyForJob(0, "", proofs.agent);
    const beforeAgent = await token.balanceOf(agent.address);
    await manager.connect(agent).requestJobCompletion(0, "result");
    const salt1 = ethers.id("v1");
    const commit1 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [v1.address, 0, true, salt1]
    );
    const salt2 = ethers.id("v2");
    const commit2 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [v2.address, 0, true, salt2]
    );
    await manager
      .connect(v1)
      .commitValidation(0, commit1, "", proofs.v1);
    await manager
      .connect(v2)
      .commitValidation(0, commit2, "", proofs.v2);
    await time.increase(1);
    await manager.connect(v1).revealValidation(0, true, salt1);
    await manager.connect(v2).revealValidation(0, true, salt2);
    await time.increase(6);
    await manager.connect(v1).validateJob(0, "", proofs.v1);
    const afterAgent = await token.balanceOf(agent.address);
    expect(afterAgent - beforeAgent).to.equal(ethers.parseEther("87"));
    expect(await manager.balanceOf(employer.address)).to.equal(1n);
    expect(await manager.ownerOf(0)).to.equal(employer.address);
  });

  it("blocks unverified participants and blacklisted addresses", async function () {
    const { token, manager, employer, agent, v1, outsider } =
      await deployFixture();
    const payout = ethers.parseEther("10");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash", payout, 1000, "details");
    await expect(
      manager.connect(outsider).applyForJob(0, "", [])
    ).to.be.revertedWithCustomError(manager, "Unauthorized");
      await manager.blacklistAgent(agent.address, true);
    await expect(
      manager.connect(agent).applyForJob(0, "", [])
    ).to.be.revertedWithCustomError(manager, "Unauthorized");
    await manager.blacklistAgent(agent.address, false);
    await manager.connect(agent).applyForJob(0, "", []);
    await manager.connect(agent).requestJobCompletion(0, "result");
    const commit = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [v1.address, 0, true, ethers.ZeroHash]
    );
    await expect(
      manager.connect(outsider).commitValidation(0, commit, "", [])
    ).to.be.revertedWithCustomError(manager, "Unauthorized");
    await manager.blacklistValidator(v1.address, true);
    await expect(
      manager.connect(v1).commitValidation(0, commit, "", [])
    ).to.be.revertedWithCustomError(manager, "Unauthorized");
  });

  it("resolves dispute and slashes agent", async function () {
    const { token, manager, owner, employer, agent, proofs } =
      await deployFixture();
    const payout = ethers.parseEther("100");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash", payout, 1000, "details");
    await manager.connect(agent).applyForJob(0, "", proofs.agent);
    await manager.connect(agent).requestJobCompletion(0, "result");
    await time.increase(12);
    await manager.connect(employer).disputeJob(0);
    const before = await manager.agentStake(agent.address);
    await manager.connect(owner).resolveDispute(0, 1);
    const after = await manager.agentStake(agent.address);
    expect(before - after).to.equal(ethers.parseEther("1"));
    await expect(manager.ownerOf(0)).to.be.reverted;
  });

  it("applies AGI type bonus to payout", async function () {
    const { token, manager, employer, agent, v1, v2, proofs, owner } =
      await deployFixture();
    await manager.setPayoutConfig(owner.address, 0, 1000, 0);
    const NFT = await ethers.getContractFactory("MockERC721");
    const nft = await NFT.deploy();
    await nft.waitForDeployment();
    await nft.mint(agent.address);
    await manager.addAGIType(await nft.getAddress(), 1000);
    const payout = ethers.parseEther("100");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash", payout, 1000, "details");
    await manager.connect(agent).applyForJob(0, "", proofs.agent);
    const before = await token.balanceOf(agent.address);
    await manager.connect(agent).requestJobCompletion(0, "result");
    const salt1 = ethers.id("v1");
    const commit1 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [v1.address, 0, true, salt1]
    );
    const salt2 = ethers.id("v2");
    const commit2 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [v2.address, 0, true, salt2]
    );
    await manager
      .connect(v1)
      .commitValidation(0, commit1, "", proofs.v1);
    await manager
      .connect(v2)
      .commitValidation(0, commit2, "", proofs.v2);
    await time.increase(1);
    await manager.connect(v1).revealValidation(0, true, salt1);
    await manager.connect(v2).revealValidation(0, true, salt2);
    await time.increase(6);
    await manager.connect(v1).validateJob(0, "", proofs.v1);
    const after = await token.balanceOf(agent.address);
    expect(after - before).to.equal(ethers.parseEther("99"));
  });

  it("measures gas for Merkle proof vs allowlist", async function () {
    const { token, manager, employer, agent, outsider, proofs } =
      await deployFixture();
    const payout = ethers.parseEther("1");
    await token.connect(employer).approve(await manager.getAddress(), payout * 2n);
    await manager
      .connect(employer)
      .createJob("jobhash1", payout, 1000, "details");
    await manager
      .connect(employer)
      .createJob("jobhash2", payout, 1000, "details");
    const tx1 = await manager
      .connect(agent)
      .applyForJob(0, "", proofs.agent);
    const receipt1 = await tx1.wait();
    await manager.addAdditionalAgent(outsider.address);
    const tx2 = await manager
      .connect(outsider)
      .applyForJob(1, "", []);
    const receipt2 = await tx2.wait();
    expect(receipt1.gasUsed).to.be.lte(receipt2.gasUsed);
  });

  it("owner can update parameters", async function () {
    const { manager, owner } = await deployFixture();
    const Token = await ethers.getContractFactory("MockERC20");
    const newToken = await Token.deploy();
    await expect(manager.updateAGITokenAddress(await newToken.getAddress()))
      .to.emit(manager, "AGITokenAddressUpdated")
      .withArgs(await newToken.getAddress());
    const newRoot = ethers.id("newroot");
    await expect(manager.setAgentRootNode(newRoot))
      .to.emit(manager, "AgentRootNodeUpdated")
      .withArgs(newRoot);
    await expect(manager.setAgentMerkleRoot(newRoot))
      .to.emit(manager, "AgentMerkleRootUpdated")
      .withArgs(newRoot);
    await expect(manager.setRequiredValidatorApprovals(1))
      .to.emit(manager, "RequiredValidatorApprovalsUpdated")
      .withArgs(1);
    await expect(
      manager.setPayoutConfig(owner.address, 0, 1000, 0)
    ).to.emit(manager, "PayoutConfigUpdated");
  });
});

