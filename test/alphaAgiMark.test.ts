import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const BASE_PRICE = ethers.parseEther("0.1");
const SLOPE = ethers.parseEther("0.05");
const MIN_RESERVE = ethers.parseEther("1");

function reserveAt(base: bigint, slope: bigint, shares: bigint): bigint {
  if (shares === 0n) {
    return 0n;
  }
  const linear = base * shares;
  const sumIndices = (shares * (shares - 1n)) / 2n;
  const curve = slope * sumIndices;
  return linear + curve;
}

function quoteBuy(base: bigint, slope: bigint, currentShares: bigint, amount: bigint): bigint {
  return reserveAt(base, slope, currentShares + amount) - reserveAt(base, slope, currentShares);
}

async function deployMarkFixture() {
  const [owner, investorA, investorB, investorC, validatorA, validatorB, validatorC] =
    await ethers.getSigners();

  const nova = await ethers.deployContract("NovaSeedNFT", [
    "α-AGI Nova-Seed",
    "NOVA",
    owner.address,
  ]);
  const seedUri = "ipfs://alpha-agi/nova-seed.json";
  await nova.connect(owner).mintSeed(owner.address, seedUri);
  const nextId = await nova.nextTokenId();
  const seedTokenId = nextId - 1n;

  const mark = await ethers.deployContract("AlphaAgiMark", [
    "α-AGI MARK SeedShares",
    "MARK",
    owner.address,
    await nova.getAddress(),
    seedTokenId,
    BASE_PRICE,
    SLOPE,
    MIN_RESERVE,
    3,
    [validatorA.address, validatorB.address, validatorC.address],
  ]);

  return {
    owner,
    investorA,
    investorB,
    investorC,
    validatorA,
    validatorB,
    validatorC,
    nova,
    mark,
    seedTokenId,
  };
}

describe("AlphaAgiMark bonding curve", function () {
  it("quotes prices and executes share lifecycle", async function () {
    const { mark, investorA } = await loadFixture(deployMarkFixture);

    const expectedCost = quoteBuy(BASE_PRICE, SLOPE, 0n, 3n);
    expect(await mark.quoteBuyShares(3)).to.equal(expectedCost);

    await expect(
      mark.connect(investorA).buyShares(3, {
        value: expectedCost,
      })
    ).to.changeEtherBalances([investorA, mark], [-expectedCost, expectedCost]);

    expect(await mark.shareBalanceOf(investorA.address)).to.equal(3n);
    expect(await mark.totalShares()).to.equal(3n);
    expect(await mark.reserveBalance()).to.equal(expectedCost);

    const expectedSell = quoteBuy(BASE_PRICE, SLOPE, 2n, 1n); // selling down to two shares
    expect(await mark.quoteSellShares(1)).to.equal(expectedSell);

    await expect(() => mark.connect(investorA).sellShares(1)).to.changeEtherBalances(
      [investorA, mark],
      [expectedSell, -expectedSell]
    );

    expect(await mark.shareBalanceOf(investorA.address)).to.equal(2n);
    expect(await mark.reserveBalance()).to.equal(expectedCost - expectedSell);
  });

  it("enforces whitelist and pause controls", async function () {
    const { mark, owner, investorA, investorB } = await loadFixture(deployMarkFixture);

    await mark.connect(owner).setWhitelistEnabled(true);
    await mark.connect(owner).setWhitelist([investorA.address], true);

    const quote = await mark.quoteBuyShares(1);
    await expect(
      mark.connect(investorB).buyShares(1, { value: quote })
    ).to.be.revertedWithCustomError(mark, "AccountNotWhitelisted").withArgs(investorB.address);

    await mark.connect(owner).setWhitelist([investorB.address], true);
    await mark.connect(owner).setWhitelistEnabled(false);

    await mark.connect(owner).pause();
    await expect(
      mark.connect(investorA).buyShares(1, { value: quote })
    ).to.be.revertedWithCustomError(mark, "EnforcedPause");

    await mark.connect(owner).unpause();
    await mark.connect(investorA).buyShares(1, { value: quote });
    expect(await mark.totalShares()).to.equal(1n);
  });

  it("requires validator approvals before launch finalisation", async function () {
    const { mark, owner, investorA, investorB, validatorA, validatorB, validatorC } =
      await loadFixture(deployMarkFixture);

    const firstCost = await mark.quoteBuyShares(5);
    await mark.connect(investorA).buyShares(5, { value: firstCost });

    await expect(
      mark.connect(owner).finalizeLaunch(owner.address)
    ).to.be.revertedWithCustomError(mark, "LaunchNotValidated");

    await mark.connect(validatorA).castRiskVote(true);
    await mark.connect(validatorB).castRiskVote(true);
    expect(await mark.seedValidated()).to.equal(false);

    const additionalCost = await mark.quoteBuyShares(3);
    await mark.connect(investorB).buyShares(3, { value: additionalCost });

    await mark.connect(validatorC).castRiskVote(true);
    expect(await mark.seedValidated()).to.equal(true);

    const reserveBefore = await mark.reserveBalance();

    const vault = await ethers.deployContract("AlphaSovereignVault", [
      owner.address,
      "α-AGI Sovereign mission",
    ]);

    await expect(mark.connect(owner).finalizeLaunch(await vault.getAddress())).to.emit(
      mark,
      "LaunchFinalized"
    );

    expect(await mark.launched()).to.equal(true);
    expect(await mark.reserveBalance()).to.equal(0n);
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(reserveBefore);

    await expect(
      mark.connect(investorA).buyShares(1, { value: await mark.quoteBuyShares(1) })
    ).to.be.revertedWithCustomError(mark, "EnforcedPause");

    await expect(mark.connect(investorA).sellShares(1)).to.be.revertedWithCustomError(
      mark,
      "EnforcedPause"
    );
  });

  it("allows comprehensive owner governance", async function () {
    const { mark, owner, validatorA, validatorB, validatorC } = await loadFixture(
      deployMarkFixture
    );

    await mark.connect(owner).pause();
    const newBase = ethers.parseEther("0.2");
    const newSlope = ethers.parseEther("0.08");
    await mark.connect(owner).updatePricing(newBase, newSlope);
    expect(await mark.basePrice()).to.equal(newBase);
    expect(await mark.slope()).to.equal(newSlope);

    await mark.connect(owner).setMinLaunchReserve(ethers.parseEther("2"));
    expect(await mark.minLaunchReserve()).to.equal(ethers.parseEther("2"));

    await expect(mark.connect(owner).setApprovalThreshold(0)).to.be.revertedWithCustomError(
      mark,
      "ApprovalThresholdInvalid"
    );

    await mark.connect(owner).updateValidator(validatorC.address, false);
    const [validators] = await mark.validators();
    expect(validators).to.deep.equal([validatorA.address, validatorB.address]);
    expect(await mark.approvalThreshold()).to.equal(2);

    await expect(
      mark.connect(owner).setApprovalThreshold(3)
    ).to.be.revertedWithCustomError(mark, "ApprovalThresholdInvalid");

    await mark.connect(owner).updateValidator(validatorC.address, true);
    const [validatorsAfter] = await mark.validators();
    expect(validatorsAfter).to.have.length(3);

    await mark.connect(owner).forceSetSeedValidationStatus(true);
    expect(await mark.seedValidated()).to.equal(true);

    await mark.connect(owner).unpause();
  });
});
