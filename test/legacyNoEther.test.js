const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Legacy contract ether rejection", function () {
  let owner;

  before(async () => {
    [owner] = await ethers.getSigners();
  });

  async function expectReject(contract) {
    await expect(
      owner.sendTransaction({ to: await contract.getAddress(), value: 1 })
    ).to.be.reverted;
  }

  it("JobRegistry", async () => {
    const Factory = await ethers.getContractFactory(
      "contracts/JobRegistry.sol:JobRegistry"
    );
    const registry = await Factory.deploy();
    await registry.waitForDeployment();
    await expectReject(registry);
  });

  it("JobNFT", async () => {
    const Token = await ethers.getContractFactory(
      "contracts/AGIALPHAToken.sol:AGIALPHAToken"
    );
    const token = await Token.deploy("AGI ALPHA", "AGIA", 0);
    const Factory = await ethers.getContractFactory("JobNFT");
    const nft = await Factory.deploy(await token.getAddress());
    await nft.waitForDeployment();
    await expectReject(nft);
  });

  it("ReputationEngine", async () => {
    const Factory = await ethers.getContractFactory(
      "contracts/ReputationEngine.sol:ReputationEngine"
    );
    const engine = await Factory.deploy();
    await engine.waitForDeployment();
    await expectReject(engine);
  });

  it("ValidationModule", async () => {
    const Factory = await ethers.getContractFactory(
      "contracts/ValidationModule.sol:ValidationModule"
    );
    const module = await Factory.deploy();
    await module.waitForDeployment();
    await expectReject(module);
  });

  it("StakeManager", async () => {
    const Factory = await ethers.getContractFactory(
      "contracts/StakeManager.sol:StakeManager"
    );
    const stake = await Factory.deploy();
    await stake.waitForDeployment();
    await expectReject(stake);
  });

  it("CertificateNFT", async () => {
    const Factory = await ethers.getContractFactory(
      "contracts/CertificateNFT.sol:CertificateNFT"
    );
    const cert = await Factory.deploy();
    await cert.waitForDeployment();
    await expectReject(cert);
  });

  it("AGIJobManagerV1", async () => {
    const Token = await ethers.getContractFactory(
      "contracts/mocks/MockERC20.sol:MockERC20"
    );
    const token = await Token.deploy();
    await token.waitForDeployment();
    const ENS = await ethers.getContractFactory(
      "contracts/mocks/MockENS.sol:MockENS"
    );
    const ens = await ENS.deploy();
    await ens.waitForDeployment();
    const Wrapper = await ethers.getContractFactory(
      "contracts/mocks/MockNameWrapper.sol:MockNameWrapper"
    );
    const wrapper = await Wrapper.deploy();
    await wrapper.waitForDeployment();
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
    await expectReject(manager);
  });
});

