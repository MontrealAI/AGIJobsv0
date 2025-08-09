import { expect } from "chai";
import { ethers } from "hardhat";

describe("Tax exemption flags", function () {
  it("all core modules report tax neutrality", async () => {
    const [owner] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/mocks/MockERC20.sol:MockERC20"
    );
    const token = await Token.deploy();
    await token.waitForDeployment();

    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const tax = await TaxPolicy.deploy(owner.address, "ipfs://policy", "ack");
    await tax.waitForDeployment();

    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    const registry = await JobRegistry.deploy(owner.address);
    await registry.waitForDeployment();

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    const stake = await StakeManager.deploy(
      await token.getAddress(),
      owner.address,
      owner.address
    );
    await stake.waitForDeployment();

    const ReputationEngine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    const rep = await ReputationEngine.deploy(owner.address);
    await rep.waitForDeployment();

    const CertificateNFT = await ethers.getContractFactory(
      "contracts/v2/CertificateNFT.sol:CertificateNFT"
    );
    const cert = await CertificateNFT.deploy("Cert", "CERT", owner.address);
    await cert.waitForDeployment();

    const ValidationModule = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    const val = await ValidationModule.deploy(
      await registry.getAddress(),
      await stake.getAddress(),
      owner.address
    );
    await val.waitForDeployment();

    const DisputeModule = await ethers.getContractFactory(
      "contracts/v2/DisputeModule.sol:DisputeModule"
    );
    const disp = await DisputeModule.deploy(
      await registry.getAddress(),
      owner.address
    );
    await disp.waitForDeployment();

    expect(await tax.isTaxExempt()).to.equal(true);
    expect(await registry.isTaxExempt()).to.equal(true);
    expect(await stake.isTaxExempt()).to.equal(true);
    expect(await rep.isTaxExempt()).to.equal(true);
    expect(await cert.isTaxExempt()).to.equal(true);
    expect(await val.isTaxExempt()).to.equal(true);
    expect(await disp.isTaxExempt()).to.equal(true);
  });
});
