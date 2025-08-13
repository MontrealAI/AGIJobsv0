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
    const tax = await TaxPolicy.deploy("ipfs://policy", "ack");
    await tax.waitForDeployment();

    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    const registry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0
    );
    await registry.waitForDeployment();

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    const stake = await StakeManager.deploy(
      await token.getAddress(),
      0,
      100,
      0,
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await stake.waitForDeployment();

    const ReputationEngine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    const rep = await ReputationEngine.deploy();
    await rep.waitForDeployment();

    const CertificateNFT = await ethers.getContractFactory(
      "contracts/v2/CertificateNFT.sol:CertificateNFT"
    );
    const cert = await CertificateNFT.deploy("Cert", "CERT");
    await cert.waitForDeployment();

    const ValidationModule = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    const val = await ValidationModule.deploy(
      await registry.getAddress(),
      await stake.getAddress(),
      1,
      1,
      1,
      1
    );
    await val.waitForDeployment();

    const DisputeModule = await ethers.getContractFactory(
      "contracts/v2/modules/DisputeModule.sol:DisputeModule"
    );
    const disp = await DisputeModule.deploy(await registry.getAddress());
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
