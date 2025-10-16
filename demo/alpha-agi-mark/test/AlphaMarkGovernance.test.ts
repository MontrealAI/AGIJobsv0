import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ethers } from "hardhat";

const toWei = (value: string) => ethers.parseEther(value);
const WHOLE = toWei("1");

describe("α-AGI MARK owner governance", function () {
  it("gives the owner decisive control over validator council and overrides", async function () {
    const [owner, validatorA, validatorB, validatorC, outsider] = await ethers.getSigners();

    const RiskOracle = await ethers.getContractFactory("AlphaMarkRiskOracle");
    const oracle = await RiskOracle.deploy(owner.address, [validatorA.address, validatorB.address], 2);
    await oracle.waitForDeployment();

    await expect(oracle.connect(outsider).setApprovalThreshold(1)).to.be.revertedWithCustomError(
      oracle,
      "OwnableUnauthorizedAccount",
    );

    await oracle.connect(owner).addValidators([validatorC.address]);
    expect(await oracle.isValidator(validatorC.address)).to.equal(true);
    expect(await oracle.approvalThreshold()).to.equal(2n);

    await oracle.connect(owner).setApprovalThreshold(3);
    expect(await oracle.approvalThreshold()).to.equal(3n);

    await oracle.connect(validatorA).approveSeed();
    await oracle.connect(validatorB).approveSeed();
    await oracle.connect(validatorC).approveSeed();
    expect(await oracle.seedValidated()).to.equal(true);

    await oracle.connect(owner).removeValidators([validatorB.address]);
    expect(await oracle.isValidator(validatorB.address)).to.equal(false);
    expect(await oracle.approvalThreshold()).to.equal(2n);
    expect(await oracle.approvalCount()).to.equal(2n);

    await oracle.connect(owner).resetApprovals();
    expect(await oracle.approvalCount()).to.equal(0n);

    await oracle.connect(owner).setOverride(true, true);
    expect(await oracle.seedValidated()).to.equal(true);

    await oracle.connect(owner).setOverride(true, false);
    expect(await oracle.seedValidated()).to.equal(false);

    await oracle.connect(owner).setOverride(false, false);
    expect(await oracle.seedValidated()).to.equal(false);
  });

  it("lets the owner retarget assets, enforce overrides, and finalize into the sovereign vault", async function () {
    const [owner, investor, validatorA, validatorB, validatorC] = await ethers.getSigners();

    const RiskOracle = await ethers.getContractFactory("AlphaMarkRiskOracle");
    const oracle = await RiskOracle.deploy(owner.address, [validatorA.address, validatorB.address, validatorC.address], 2);
    await oracle.waitForDeployment();

    const AlphaMark = await ethers.getContractFactory("AlphaMarkEToken");
    const basePrice = toWei("0.25");
    const slope = toWei("0.05");
    const mark = await AlphaMark.deploy(
      "SeedShares",
      "SEED",
      owner.address,
      oracle.target,
      basePrice,
      slope,
      0,
      ethers.ZeroAddress,
    );
    await mark.waitForDeployment();

    const Vault = await ethers.getContractFactory("AlphaSovereignVault");
    const vault = await Vault.deploy(owner.address, "ipfs://sovereign-manifest");
    await vault.waitForDeployment();

    await vault.connect(owner).designateMarkExchange(mark.target);

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const stable = await MockERC20.deploy("Stable", "STBL");
    await stable.waitForDeployment();

    await stable.mint(investor.address, toWei("1000"));

    await mark.connect(owner).setWhitelistEnabled(false);
    await mark.connect(owner).setBaseAsset(stable.target);
    await mark.connect(owner).setTreasury(vault.target as string);

    const purchaseAmount = 4n;
    const cost = await mark.previewPurchaseCost(purchaseAmount * WHOLE);
    await stable.connect(investor).approve(mark.target, cost);
    await mark.connect(investor).buyTokens(purchaseAmount * WHOLE);

    expect(await mark.usesNativeAsset()).to.equal(false);
    expect(await mark.reserveBalance()).to.equal(cost);

    await expect(mark.connect(owner).finalizeLaunch(vault.target as string, "0x"))
      .to.be.revertedWith("Not validated");

    await mark.connect(owner).setValidationOverride(true, true);

    const metadata = ethers.hexlify(ethers.toUtf8Bytes("vault-launch"));
    await expect(mark.connect(owner).finalizeLaunch(vault.target as string, metadata))
      .to.emit(mark, "LaunchFinalized")
      .withArgs(vault.target, cost, metadata);

    expect(await mark.finalized()).to.equal(true);
    expect(await mark.reserveBalance()).to.equal(0n);
    expect(await stable.balanceOf(vault.target)).to.equal(cost);
    expect(await vault.lastAcknowledgedAmount()).to.equal(cost);
    expect(await vault.lastAcknowledgedMetadata()).to.equal(metadata);
  });

  it("grants the sovereign vault owner pause and withdrawal authority", async function () {
    const [owner, other, recipient] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory("AlphaSovereignVault");
    const vault = await Vault.deploy(owner.address, "ipfs://nova-seed");
    await vault.waitForDeployment();

    await expect(vault.connect(other).setManifestUri("ipfs://blocked"))
      .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    await vault.connect(owner).setManifestUri("ipfs://updated");
    expect(await vault.manifestUri()).to.equal("ipfs://updated");

    await expect(vault.connect(other).designateMarkExchange(other.address))
      .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    await vault.connect(owner).designateMarkExchange(owner.address);

    await expect(vault.connect(other).pauseVault()).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount",
    );
    await vault.connect(owner).pauseVault();
    await expect(vault.connect(owner).notifyLaunch(1, "0x"))
      .to.be.revertedWithCustomError(vault, "EnforcedPause");
    await vault.connect(owner).unpauseVault();

    await expect(vault.connect(other).notifyLaunch(1, "0x"))
      .to.be.revertedWith("Unauthorized sender");

    const metadata = ethers.hexlify(ethers.toUtf8Bytes("ignition"));
    await expect(vault.connect(owner).notifyLaunch(123n, metadata))
      .to.emit(vault, "LaunchAcknowledged")
      .withArgs(owner.address, 123n, metadata, anyValue);

    const depositAmount = toWei("1");
    await owner.sendTransaction({ to: vault.target, value: depositAmount });
    expect(await vault.totalReceived()).to.equal(depositAmount);

    await expect(vault.connect(other).withdraw(recipient.address, toWei("0.1")))
      .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    await expect(vault.connect(owner).withdraw(ethers.ZeroAddress, toWei("0.1")))
      .to.be.revertedWith("Recipient required");

    const withdrawal = toWei("0.25");
    const balanceBefore = await ethers.provider.getBalance(recipient.address);
    await expect(vault.connect(owner).withdraw(recipient.address, withdrawal))
      .to.emit(vault, "TreasuryWithdrawal")
      .withArgs(recipient.address, withdrawal);
    const balanceAfter = await ethers.provider.getBalance(recipient.address);
    expect(balanceAfter - balanceBefore).to.equal(withdrawal);

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const stable = await MockERC20.deploy("Stable", "STBL");
    await stable.waitForDeployment();
    await stable.mint(vault.target, toWei("5"));

    await expect(vault.connect(other).withdrawToken(stable.target, recipient.address, toWei("1")))
      .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");

    await expect(vault.connect(owner).withdrawToken(stable.target, recipient.address, toWei("1")))
      .to.emit(vault, "TreasuryTokenWithdrawal")
      .withArgs(stable.target, recipient.address, toWei("1"));

    expect(await stable.balanceOf(recipient.address)).to.equal(toWei("1"));
  });
});
