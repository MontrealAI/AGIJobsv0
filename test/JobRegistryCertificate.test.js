const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, employer, agent, other] = await ethers.getSigners();

  const Validation = await ethers.getContractFactory(
    "contracts/ValidationModule.sol:ValidationModule"
  );
  const validation = await Validation.deploy(owner.address);
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
  const cert = await Cert.deploy("Cert", "CERT", owner.address);
  await cert.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    "contracts/JobRegistry.sol:JobRegistry"
  );
  const registry = await Registry.deploy(owner.address);
  await registry.waitForDeployment();

  await registry.setValidationModule(await validation.getAddress());
  await registry.setReputationEngine(await reputation.getAddress());
  await registry.setStakeManager(await stake.getAddress());
  await registry.setCertificateNFT(await cert.getAddress());
  await registry.setJobParameters(1, 1);

  await cert.setMinter(await registry.getAddress(), true);
  await cert.setBaseURI("ipfs://");

  return { owner, employer, agent, other, validation, reputation, stake, cert, registry };
}

describe("JobRegistry and CertificateNFT", function () {
  it("prevents self-hiring", async function () {
    const { registry, employer } = await deployFixture();
    await registry.connect(employer).acknowledgeTaxPolicy();
    await expect(
      registry.connect(employer).createJob(employer.address)
    ).to.be.revertedWith("self");
  });

  it("mints certificate with output URI on completion", async function () {
    const { registry, employer, agent, validation, cert } = await deployFixture();

    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();
    await registry.connect(employer).createJob(agent.address);
    const jobId = 1;
    await validation.setOutcome(jobId, true);
    await registry.connect(agent).completeJob(jobId, "result.json");
    await registry.finalize(jobId);

    expect(await cert.ownerOf(jobId)).to.equal(agent.address);
    expect(await cert.tokenURI(jobId)).to.equal("ipfs://result.json");
    await expect(registry.finalize(jobId)).to.be.revertedWith("not ready");
  });

  it("restricts minting to authorized minters", async function () {
    const { cert, agent } = await deployFixture();
    await expect(
      cert.connect(agent).mintCertificate(agent.address, 1, "foo")
    ).to.be.revertedWith("not minter");
  });
});
