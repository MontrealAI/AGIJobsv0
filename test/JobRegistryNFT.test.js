const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, employer, agent] = await ethers.getSigners();

  const Validation = await ethers.getContractFactory(
    "contracts/ValidationModule.sol:ValidationModule"
  );
  const validation = await Validation.deploy();
  await validation.waitForDeployment();

  const Reputation = await ethers.getContractFactory(
    "contracts/mocks/StubReputationEngine.sol:StubReputationEngine"
  );
  const reputation = await Reputation.deploy();
  await reputation.waitForDeployment();

  const Stake = await ethers.getContractFactory(
    "contracts/mocks/StubStakeManager.sol:StubStakeManager"
  );
  const stake = await Stake.deploy();
  await stake.waitForDeployment();
  await stake.setStake(agent.address, 1);

  const Cert = await ethers.getContractFactory(
    "contracts/CertificateNFT.sol:CertificateNFT"
  );
  const cert = await Cert.deploy();
  await cert.waitForDeployment();

  const Token = await ethers.getContractFactory(
    "contracts/AGIALPHAToken.sol:AGIALPHAToken"
  );
  const token = await Token.deploy("AGI ALPHA", "AGIA", 0);
  await token.waitForDeployment();

  const NFT = await ethers.getContractFactory("JobNFT");
  const nft = await NFT.deploy(await token.getAddress());
  await nft.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    "contracts/JobRegistry.sol:JobRegistry"
  );
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  await registry.setValidationModule(await validation.getAddress());
  await registry.setReputationEngine(await reputation.getAddress());
  await registry.setStakeManager(await stake.getAddress());
  await registry.setCertificateNFT(await cert.getAddress());
  await registry.setJobNFT(await nft.getAddress());
  await registry.setJobParameters(1, 1);

  await cert.setMinter(await registry.getAddress(), true);
  await nft.setJobRegistry(await registry.getAddress());

  return { registry, validation, reputation, stake, cert, nft, employer, agent };
}

describe("JobRegistry integrates JobNFT", function () {
  it("mints JobNFT to employer on finalization", async function () {
    const { registry, validation, cert, nft, employer, agent } = await deployFixture();

    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();
    await registry.connect(employer).createJob(agent.address);
    const jobId = 1;
    await validation.setOutcome(jobId, true);
    await registry.connect(agent).completeJob(jobId, "output.json");
    await expect(registry.finalize(jobId))
      .to.emit(nft, "NFTIssued")
      .withArgs(employer.address, jobId);

    expect(await nft.ownerOf(jobId)).to.equal(employer.address);
    // certificate also minted to agent
    expect(await cert.ownerOf(jobId)).to.equal(agent.address);
  });
});

