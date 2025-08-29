const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function deploySystem() {
  const [owner, employer, agent] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("contracts/v2/AGIALPHAToken.sol:AGIALPHAToken");
  const token = await Token.deploy();
  await token.mint(employer.address, ethers.parseUnits("1000", 6));
  await token.mint(agent.address, ethers.parseUnits("1000", 6));

  const Stake = await ethers.getContractFactory("contracts/v2/StakeManager.sol:StakeManager");
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

  await stake.setMinStake(0);

  const Reputation = await ethers.getContractFactory("contracts/v2/ReputationEngine.sol:ReputationEngine");
  const reputation = await Reputation.deploy(await stake.getAddress());

  const Identity = await ethers.getContractFactory("contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock");
  const identity = await Identity.deploy();
  await identity.setReputationEngine(await reputation.getAddress());

  const Validation = await ethers.getContractFactory("contracts/v2/mocks/ValidationStub.sol:ValidationStub");
  const validation = await Validation.deploy();

  const NFT = await ethers.getContractFactory("contracts/v2/CertificateNFT.sol:CertificateNFT");
  const nft = await NFT.deploy("Cert","CERT");

  const Registry = await ethers.getContractFactory("contracts/v2/JobRegistry.sol:JobRegistry");
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await nft.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    owner.address
  );

  const Dispute = await ethers.getContractFactory("contracts/v2/modules/DisputeModule.sol:DisputeModule");
  const dispute = await Dispute.deploy(await registry.getAddress(), 0, 0, owner.address);

  await stake.setModules(await registry.getAddress(), await dispute.getAddress());
  await validation.setJobRegistry(await registry.getAddress());
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress(),
    ethers.ZeroAddress,
    []
  );
  await registry.setIdentityRegistry(await identity.getAddress());
  await reputation.setCaller(await registry.getAddress(), true);

  return { owner, employer, agent, token, stake, reputation, validation, nft, registry, dispute };
}

describe("Mid-job module replacement fuzz", function () {
  it("preserves job state across random upgrades", async function () {
    for (let i = 0; i < 5; i++) {
      const env = await deploySystem();
      const { owner, employer, agent, token, stake, reputation, validation, nft, registry, dispute } = env;

      const reward = ethers.parseUnits(String(10 + Math.floor(Math.random() * 90)), 6);
      const result = Math.random() > 0.5;
      const stakeAmount = ethers.parseUnits("1", 6);
      await token.connect(agent).approve(await stake.getAddress(), stakeAmount);
      await stake.connect(agent).depositStake(0, stakeAmount);
      await token
        .connect(employer)
        .approve(await stake.getAddress(), reward + (reward * 5n) / 100n);
      const deadline = BigInt((await time.latest()) + 3600);
      await registry.connect(employer).createJob(reward, deadline, "ipfs://job");
      await registry.connect(agent).applyForJob(1, "agent", []);
      const hash = ethers.id("ipfs://result");
      await registry
        .connect(agent)
        .submit(1, hash, "ipfs://result", "agent", []);

      const Validation = await ethers.getContractFactory("contracts/v2/mocks/ValidationStub.sol:ValidationStub");
      const newValidation = await Validation.deploy();
      await newValidation.setJobRegistry(await registry.getAddress());
      await registry
        .connect(owner)
        .setModules(
          await newValidation.getAddress(),
          await stake.getAddress(),
          await reputation.getAddress(),
          await dispute.getAddress(),
          await nft.getAddress(),
          ethers.ZeroAddress,
          []
        );
      await newValidation.setResult(result);
      await newValidation.finalize(1);
      const job = await registry.jobs(1);
      expect([5,6]).to.include(Number(job.state));
      expect(job.success).to.equal(result);
    }
  });
});
