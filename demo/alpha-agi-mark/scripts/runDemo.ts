import hardhat from "hardhat";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

const hre = hardhat as HardhatRuntimeEnvironment;
const ethers = (hre as unknown as { ethers: any }).ethers;

const format = (value: bigint) => `${ethers.formatEther(value)} ETH`;

async function safeAttempt<T>(label: string, action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    console.warn(`⚠️  ${label} failed: ${(error as Error).message}`);
    return undefined;
  }
}

async function main() {
  const [owner, investorA, investorB, investorC, validatorA, validatorB, validatorC] =
    await ethers.getSigners();

  console.log("\n🚀 α-AGI MARK – Autonomous Foresight Launchpad Demo\n");

  const seedFactory = await ethers.getContractFactory("NovaSeedNFT");
  const seed = await seedFactory.connect(owner).deploy(owner.address);
  await seed.waitForDeployment();
  await seed.connect(owner).mint(owner.address, "ipfs://alpha-agi-mark/nova-seed");

  const basePrice = ethers.parseEther("0.1");
  const slope = ethers.parseEther("0.05");
  const maxSupply = ethers.parseEther("1000");

  const markFactory = await ethers.getContractFactory("AlphaAgiMark");
  const mark = await markFactory
    .connect(owner)
    .deploy(
      owner.address,
      await seed.getAddress(),
      1n,
      {
        basePrice,
        slope,
        maxSupply,
      },
      3,
      [validatorA.address, validatorB.address, validatorC.address],
      "We channel foresight into sovereign ventures",
    );
  await mark.waitForDeployment();

  console.log(`Seed contract: ${await seed.getAddress()}`);
  console.log(`α-AGI MARK address: ${await mark.getAddress()}`);
  console.log(`Initial base price: ${format(basePrice)} | slope: ${format(slope)} per token`);

  const purchases = [
    { signer: investorA, label: "Visionary Strategist", amount: ethers.parseEther("10") },
    { signer: investorB, label: "Climate Oracle", amount: ethers.parseEther("5") },
    { signer: investorC, label: "Interstellar Treasury", amount: ethers.parseEther("8") },
  ];

  for (const purchase of purchases) {
    const cost = await mark.calculatePurchaseCost.staticCall(purchase.amount);
    console.log(
      `→ ${purchase.label} buying ${ethers.formatEther(purchase.amount)} Seed Shares for ${format(cost)}`,
    );
    await mark.connect(purchase.signer).buyShares(purchase.amount, { value: cost });
    console.log(
      `   total supply now ${ethers.formatEther(await mark.totalSupply())} | reserve ${format(
        await mark.reserveCoverage(),
      )}`,
    );
  }

  console.log("\n🛡️  Owner exercises pause/unpause to demonstrate circuit breaker");
  await mark.connect(owner).pauseMarket();
  console.log("   market paused: ", await mark.paused());
  await mark.connect(owner).unpauseMarket();
  console.log("   market resumed: ", !(await mark.paused()));

  console.log("\n📜 Enabling compliance whitelist and registering current backers");
  await mark.connect(owner).setWhitelistEnabled(true);
  await mark.connect(owner).setWhitelistBatch(
    [investorA.address, investorB.address, investorC.address],
    true,
  );
  console.log("   whitelist active: ", await mark.whitelistEnabled());

  console.log("\n💧 Liquidity check – Visionary Strategist sells 2 shares back to the curve");
  const sellAmount = ethers.parseEther("2");
  const saleReturn = await mark.calculateSaleReturn.staticCall(sellAmount);
  await mark.connect(investorA).sellShares(sellAmount);
  console.log(
    `   redeemed ${ethers.formatEther(sellAmount)} shares for ${format(saleReturn)} | supply ${
      ethers.formatEther(await mark.totalSupply())
    }`
  );

  console.log("\n🧠 Validator council casts risk approvals");
  await mark.connect(validatorA).approveSeed();
  console.log("   validator A approved (1/3)");
  await mark.connect(validatorB).approveSeed();
  console.log("   validator B approved (2/3)");

  console.log("\n🚫 Attempting to finalise before consensus should fail");
  await safeAttempt("Early finalisation", async () => {
    const vaultFactory = await ethers.getContractFactory("SovereignVault");
    const dryVault = await vaultFactory
      .connect(owner)
      .deploy(owner.address, "Dry Run Sovereign Vault");
    await dryVault.waitForDeployment();
    await mark.connect(owner).finaliseLaunch(await dryVault.getAddress());
  });

  console.log("\n🔥 Third validator ignites the green flame");
  await mark.connect(validatorC).approveSeed();
  console.log("   approvals gathered: ", await mark.validatorApprovalCount());

  console.log("\n🏛️ Deploying sovereign vault and finalising launch");
  const vaultFactory = await ethers.getContractFactory("SovereignVault");
  const vault = await vaultFactory
    .connect(owner)
    .deploy(owner.address, "α-AGI Sovereign Mandate");
  await vault.waitForDeployment();
  await mark.connect(owner).finaliseLaunch(await vault.getAddress());

  console.log("   launch finalised – funds transferred to", await vault.getAddress());
  console.log("   sovereign vault balance: ", format(await ethers.provider.getBalance(await vault.getAddress())));

  console.log("\n📊 Owner parameter matrix snapshot");
  const matrix = {
    owner: owner.address,
    paused: await mark.paused(),
    whitelistEnabled: await mark.whitelistEnabled(),
    validatorThreshold: await mark.validatorThreshold(),
    approvals: await mark.validatorApprovalCount(),
    seedValidated: await mark.seedValidated(),
    launchFinalised: await mark.launchFinalised(),
    reserveBalance: format(await mark.reserveCoverage()),
    totalSupply: ethers.formatEther(await mark.totalSupply()),
    sovereignVault: await mark.sovereignVault(),
    manifesto: await mark.seedManifesto(),
  };
  console.table(matrix);

  console.log("\n✅ α-AGI MARK demo complete – non-technical operators just launched a sovereign venture.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
