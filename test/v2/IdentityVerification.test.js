const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Identity verification enforcement", function () {
  describe("JobRegistry", function () {
    let owner, employer, agent;
    let registry, rep, identity, stakeManager;

    beforeEach(async () => {
      [owner, employer, agent] = await ethers.getSigners();

      const Stake = await ethers.getContractFactory(
        "contracts/legacy/MockV2.sol:MockStakeManager"
      );
      stakeManager = await Stake.deploy();

      const Rep = await ethers.getContractFactory(
        "contracts/v2/ReputationEngine.sol:ReputationEngine"
      );
      rep = await Rep.deploy(await stakeManager.getAddress());

      const ENS = await ethers.getContractFactory(
        "contracts/legacy/MockENS.sol:MockENS"
      );
      const ens = await ENS.deploy();
      const Wrapper = await ethers.getContractFactory(
        "contracts/legacy/MockNameWrapper.sol:MockNameWrapper"
      );
      const wrapper = await Wrapper.deploy();

      const Identity = await ethers.getContractFactory(
        "contracts/v2/IdentityRegistry.sol:IdentityRegistry"
      );
      identity = await Identity.deploy(
        await ens.getAddress(),
        await wrapper.getAddress(),
        await rep.getAddress(),
        ethers.id("agi"),
        ethers.id("club")
      );

      const Registry = await ethers.getContractFactory(
        "contracts/v2/JobRegistry.sol:JobRegistry"
      );
      registry = await Registry.deploy(
        ethers.ZeroAddress,
        await stakeManager.getAddress(),
        await rep.getAddress(),
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        0,
        0,
        [],
        owner.address
      );
      await registry.connect(owner).setIdentityRegistry(await identity.getAddress());
      await rep
        .connect(owner)
        .setAuthorizedCaller(await registry.getAddress(), true);
      await rep.connect(owner).setAuthorizedCaller(owner.address, true);

      const Policy = await ethers.getContractFactory(
        "contracts/v2/TaxPolicy.sol:TaxPolicy"
      );
      const policy = await Policy.deploy("uri", "ack");
      await registry.connect(owner).setTaxPolicy(await policy.getAddress());
      await policy
        .connect(owner)
        .setAcknowledger(await registry.getAddress(), true);
      await policy.connect(employer).acknowledge();
      await policy.connect(agent).acknowledge();
      await registry.connect(owner).setMaxJobReward(1000);
      await registry.connect(owner).setJobDurationLimit(1000);
      await registry.connect(owner).setFeePct(0);
      await registry.connect(owner).setJobParameters(0, 0);
    });

    async function createJob() {
      const deadline = (await time.latest()) + 100;
      await registry.connect(employer).createJob(1, deadline, "uri");
      return 1;
    }

    it("rejects agents lacking ENS or merkle proof", async () => {
      const jobId = await createJob();
      await expect(
        registry.connect(agent).applyForJob(jobId, "a", [])
      ).to.be.revertedWithCustomError(registry, "NotAuthorizedAgent");
    });

    it("rejects unauthorized agent submissions", async () => {
      await identity.addAdditionalAgent(agent.address);
      const jobId = await createJob();
      await registry.connect(agent).applyForJob(jobId, "a", []);
      await identity.removeAdditionalAgent(agent.address);
      await expect(
        registry
          .connect(agent)
          .submit(jobId, ethers.id("res"), "res", "a", [])
      ).to.be.revertedWithCustomError(registry, "NotAuthorizedAgent");
    });
  });

  describe("ValidationModule", function () {
    let owner, employer, v1, v2, v3;
    let validation, stakeManager, jobRegistry, reputation, identity;

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
        60,
        60,
        3,
        3,
        []
      );
      await validation.waitForDeployment();
      await validation
        .connect(owner)
        .setReputationEngine(await reputation.getAddress());

      const ENS = await ethers.getContractFactory(
        "contracts/legacy/MockENS.sol:MockENS"
      );
      const ens = await ENS.deploy();
      const Wrapper = await ethers.getContractFactory(
        "contracts/legacy/MockNameWrapper.sol:MockNameWrapper"
      );
      const wrapper = await Wrapper.deploy();
      const Identity = await ethers.getContractFactory(
        "contracts/v2/IdentityRegistry.sol:IdentityRegistry"
      );
      identity = await Identity.deploy(
        await ens.getAddress(),
        await wrapper.getAddress(),
        await reputation.getAddress(),
        ethers.id("agi"),
        ethers.id("club")
      );
      await validation
        .connect(owner)
        .setIdentityRegistry(await identity.getAddress());
      await identity.addAdditionalValidator(v1.address);
      await identity.addAdditionalValidator(v2.address);
      await identity.addAdditionalValidator(v3.address);

      await stakeManager.setStake(
        v1.address,
        1,
        ethers.parseEther("100")
      );
      await stakeManager.setStake(
        v2.address,
        1,
        ethers.parseEther("50")
      );
      await stakeManager.setStake(
        v3.address,
        1,
        ethers.parseEther("10")
      );
      await validation
        .connect(owner)
        .setValidatorPool([v1.address, v2.address, v3.address]);

      const jobStruct = {
        employer: employer.address,
        agent: ethers.ZeroAddress,
        reward: 0,
        stake: 0,
        success: false,
        status: 3,
        uriHash: ethers.ZeroHash,
        resultHash: ethers.ZeroHash,
      };
      await jobRegistry.setJob(1, jobStruct);
    });

    async function select(jobId, entropy = 0) {
      await validation.selectValidators(jobId, entropy);
      await ethers.provider.send("evm_mine", []);
      return validation.connect(v1).selectValidators(jobId, 0);
    }

    async function advance(seconds) {
      await ethers.provider.send("evm_increaseTime", [seconds]);
      await ethers.provider.send("evm_mine", []);
    }

    it("rejects validators lacking ENS or merkle proof", async () => {
      const tx = await select(1);
      const receipt = await tx.wait();
      const selected = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
      ).args[1];
      const val = selected[0];
      const signerMap = {
        [v1.address.toLowerCase()]: v1,
        [v2.address.toLowerCase()]: v2,
        [v3.address.toLowerCase()]: v3,
      };
      const signer = signerMap[val.toLowerCase()];

      await identity.removeAdditionalValidator(val);
      const salt = ethers.keccak256(ethers.toUtf8Bytes("salt"));
      const nonce = await validation.jobNonce(1);
      const commit = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "bool", "bytes32"],
        [1n, nonce, true, salt]
      );
      await expect(
        validation.connect(signer).commitValidation(1, commit, "", [])
      ).to.be.revertedWithCustomError(validation, "UnauthorizedValidator");

      await identity.addAdditionalValidator(val);
      await (
        await validation
          .connect(signer)
          .commitValidation(1, commit, "", [])
      ).wait();
      await advance(61);
      await identity.removeAdditionalValidator(val);
      await expect(
        validation
          .connect(signer)
          .revealValidation(1, true, salt, "", [])
      ).to.be.revertedWithCustomError(validation, "UnauthorizedValidator");
    });
  });
});
