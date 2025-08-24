const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, employer, agent, other] = await ethers.getSigners();

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

  const Registry = await ethers.getContractFactory(
    "contracts/JobRegistry.sol:JobRegistry"
  );
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  await registry.setReputationEngine(await reputation.getAddress());
  await registry.setStakeManager(await stake.getAddress());
  await registry.setCertificateNFT(await cert.getAddress());
  await registry.setJobParameters(1, 1, 100);
  await registry.addAdditionalAgent(agent.address);

  await cert.setJobRegistry(await registry.getAddress());
  return { owner, employer, agent, other, reputation, stake, cert, registry };
}

describe("JobRegistry and CertificateNFT", function () {
  it("prevents self-hiring", async function () {
    const { registry, employer } = await deployFixture();
    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(employer).createJob();
    await expect(registry.connect(employer).applyForJob(1)).to.be.revertedWith(
      "self"
    );
  });

  it("mints certificate with output URI on completion", async function () {
    const { registry, employer, agent, cert, owner } = await deployFixture();

    await registry.connect(owner).acknowledgeTaxPolicy();
    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();
    await registry.connect(employer).createJob();
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId);
    await registry.connect(agent).submit(jobId, "ipfs://result.json");
    await registry.finalize(jobId);

    expect(await cert.ownerOf(jobId)).to.equal(agent.address);
    const hash = await cert.tokenHashes(jobId);
    expect(hash).to.equal(ethers.keccak256(ethers.toUtf8Bytes("ipfs://result.json")));
    await expect(registry.finalize(jobId)).to.be.revertedWith("not ready");
  });

  it("restricts minting to authorized minters", async function () {
    const { cert, agent } = await deployFixture();
    await expect(
      cert.connect(agent).mint(agent.address, 1, "foo")
    )
      .to.be.revertedWithCustomError(cert, "NotJobRegistry")
      .withArgs(agent.address);
  });
});
