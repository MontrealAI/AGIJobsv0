const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const Role = { Agent: 0, Validator: 1, Platform: 2 };

async function deploySystem() {
  const [owner, employer, agent] = await ethers.getSigners();

  const Token = await ethers.getContractFactory(
    "contracts/legacy/MockERC206Decimals.sol:MockERC206Decimals"
  );
  const token = await Token.deploy();
  await token.waitForDeployment();
  await token.mint(employer.address, ethers.parseUnits("1000", 6));
  await token.mint(agent.address, ethers.parseUnits("1000", 6));

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
  await stake.waitForDeployment();

  const Reputation = await ethers.getContractFactory(
    "contracts/v2/ReputationEngine.sol:ReputationEngine"
  );
  const reputation = await Reputation.deploy(await stake.getAddress());
  await reputation.waitForDeployment();

  const Identity = await ethers.getContractFactory(
    "contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock"
  );
  const identity = await Identity.deploy();
  await identity.waitForDeployment();
  await identity.setReputationEngine(await reputation.getAddress());

  const Validation = await ethers.getContractFactory(
    "contracts/v2/mocks/ValidationStub.sol:ValidationStub"
  );
  const validation = await Validation.deploy();
  await validation.waitForDeployment();

  const NFT = await ethers.getContractFactory(
    "contracts/v2/CertificateNFT.sol:CertificateNFT"
  );
  const nft = await NFT.deploy("Cert", "CERT");
  await nft.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    "contracts/v2/JobRegistry.sol:JobRegistry"
  );
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
  await registry.waitForDeployment();

  const Dispute = await ethers.getContractFactory(
    "contracts/v2/modules/DisputeModule.sol:DisputeModule"
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    owner.address
  );
  await dispute.waitForDeployment();

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

describe("Module replacement", function () {
  it("preserves job state when swapping validation module via installer", async function () {
    const env = await deploySystem();
    const { owner, employer, agent, token, stake, reputation, validation, nft, registry, dispute } = env;

    const stakeAmount = ethers.parseUnits("1", 6);
    await token.connect(agent).approve(await stake.getAddress(), stakeAmount);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmount);

    const reward = ethers.parseUnits("100", 6);
    const fee = (reward * 5n) / 100n;
    await token
      .connect(employer)
      .approve(await stake.getAddress(), reward + fee);
    const deadline = BigInt((await time.latest()) + 3600);
    await registry.connect(employer).createJob(reward, deadline, "ipfs://job");

    await registry.connect(agent).applyForJob(1, "agent", []);
    const hash = ethers.id("ipfs://result");
    await registry
      .connect(agent)
      .submit(1, hash, "ipfs://result", "agent", []);

    const before = await registry.jobs(1);

    const Installer = await ethers.getContractFactory(
      "contracts/v2/ModuleInstaller.sol:ModuleInstaller"
    );
    const installer = await Installer.deploy();
    await installer.waitForDeployment();

    await registry.connect(owner).setGovernance(await installer.getAddress());

    const Validation = await ethers.getContractFactory(
      "contracts/v2/mocks/ValidationStub.sol:ValidationStub"
    );
    const newValidation = await Validation.deploy();
    await newValidation.waitForDeployment();

    await installer
      .connect(owner)
      .replaceValidationModule(
        await registry.getAddress(),
        await newValidation.getAddress(),
        []
      );

    await newValidation.setResult(true);
    await newValidation.finalize(1);

    const after = await registry.jobs(1);
    expect(after.employer).to.equal(before.employer);
    expect(after.agent).to.equal(before.agent);
    expect(after.state).to.equal(6); // Finalized
  });

  it("rejects modules with mismatched versions", async function () {
    const env = await deploySystem();
    const { owner, registry, stake, dispute } = env;
    const Version = await ethers.getContractFactory(
      "contracts/v2/mocks/VersionMock.sol:VersionMock"
    );
    const bad = await Version.deploy(2);

    await expect(
      registry.connect(owner).setDisputeModule(await bad.getAddress())
    ).to.be.revertedWith("Invalid dispute module");

    await expect(
      stake.connect(owner).setDisputeModule(await bad.getAddress())
    ).to.be.revertedWith("Invalid dispute module");

    await expect(
      stake.connect(owner).setValidationModule(await bad.getAddress())
    ).to.be.revertedWith("Invalid validation module");

    await expect(
      stake
        .connect(owner)
        .setModules(await bad.getAddress(), await dispute.getAddress())
    ).to.be.revertedWith("Invalid job registry");

    await expect(
      stake
        .connect(owner)
        .setModules(await registry.getAddress(), await bad.getAddress())
    ).to.be.revertedWith("Invalid dispute module");
  });
});
