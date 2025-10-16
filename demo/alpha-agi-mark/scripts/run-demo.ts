import fs from "node:fs/promises";
import path from "node:path";
import { ethers } from "hardhat";

interface LedgerEntry {
  step: string;
  detail: string;
  transaction?: string;
}

function formatEth(value: bigint): string {
  return `${ethers.formatEther(value)} ETH`;
}

function shortError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length < 8) {
    throw new Error("Insufficient signers for the MARK demo");
  }

  const owner = signers[0];
  const investorA = signers[1];
  const investorB = signers[2];
  const investorC = signers[3];
  const validatorA = signers[4];
  const validatorB = signers[5];
  const validatorC = signers[6];
  const outsider = signers[7];

  const basePrice = ethers.parseEther("0.1");
  const slope = ethers.parseEther("0.05");
  const minReserve = ethers.parseEther("1");

  const ledger: LedgerEntry[] = [];
  const record = (step: string, detail: string, transaction?: string) => {
    const entry: LedgerEntry = { step, detail };
    if (transaction) {
      entry.transaction = transaction;
    }
    ledger.push(entry);
    console.log(`➡️  ${step}: ${detail}${transaction ? ` (tx: ${transaction})` : ""}`);
  };

  record("initialisation", "Bootstrapping α-AGI MARK foresight exchange on local Hardhat network");

  const novaFactory = await ethers.getContractFactory("NovaSeedNFT");
  const nova = await novaFactory
    .connect(owner)
    .deploy("α-AGI Nova-Seeds", "NOVA", owner.address);
  await nova.waitForDeployment();
  record("deploy.nova", `NovaSeedNFT deployed at ${await nova.getAddress()}`);

  const mintTx = await nova
    .connect(owner)
    .mintSeed(owner.address, "ipfs://alpha-agi/green-flame-seed.json");
  const mintReceipt = await mintTx.wait();
  const seedTokenId = (await nova.nextTokenId()) - 1n;
  record(
    "seed.mint",
    `Nova-Seed ${seedTokenId.toString()} minted with encrypted foresight genome`,
    mintReceipt?.hash
  );

  const markFactory = await ethers.getContractFactory("AlphaAgiMark");
  const mark = await markFactory
    .connect(owner)
    .deploy(
      "α-AGI MARK SeedShares",
      "MARK",
      owner.address,
      await nova.getAddress(),
      seedTokenId,
      basePrice,
      slope,
      minReserve,
      3,
      [validatorA.address, validatorB.address, validatorC.address]
    );
  await mark.waitForDeployment();
  record("deploy.mark", `MARK bonding-curve exchange deployed at ${await mark.getAddress()}`);

  await nova
    .connect(owner)
    .transferFrom(owner.address, await mark.getAddress(), seedTokenId);
  record("seed.custody", `Nova-Seed ${seedTokenId.toString()} placed under MARK custodianship`);

  const demandSeries = [
    { signer: investorA, shares: 3, label: "Visionary A" },
    { signer: investorB, shares: 2, label: "Visionary B" },
    { signer: investorC, shares: 4, label: "Visionary C" },
  ];

  for (const order of demandSeries) {
    const quote = await mark.quoteBuyShares(order.shares);
    const tx = await mark
      .connect(order.signer)
      .buyShares(order.shares, { value: quote });
    await tx.wait();
    record(
      "market.purchase",
      `${order.label} acquired ${order.shares} MARK shares for ${formatEth(quote)}`,
      tx.hash
    );
  }

  record(
    "market.price",
    `Dynamic price for next share is ${formatEth(await mark.currentPrice())}`
  );

  await mark.connect(owner).setWhitelistEnabled(true);
  await mark
    .connect(owner)
    .setWhitelist([
      investorA.address,
      investorB.address,
      investorC.address,
      owner.address,
    ], true);
  record("compliance.whitelist", "Whitelist activated for accredited supporters");

  try {
    const attemptedQuote = await mark.quoteBuyShares(1);
    await mark.connect(outsider).buyShares(1, { value: attemptedQuote });
  } catch (error) {
    record(
      "compliance.blocked",
      "Non-whitelisted address prevented from acquiring shares",
      shortError(error)
    );
  }

  await mark.connect(owner).setWhitelistEnabled(false);
  record("compliance.whitelist", "Whitelist relaxed to reopen permissionless access");

  await mark.connect(owner).pause();
  record("governance.pause", "Owner executed emergency pause to audit flows");

  try {
    const pausedQuote = await mark.quoteBuyShares(1);
    await mark.connect(investorC).buyShares(1, { value: pausedQuote });
  } catch (error) {
    record("governance.pause.enforced", "Paused market rejected new trade", shortError(error));
  }

  await mark.connect(owner).unpause();
  record("governance.resume", "Trading corridor reopened by owner");

  const resumeQuote = await mark.quoteBuyShares(2);
  const resumeTx = await mark
    .connect(investorA)
    .buyShares(2, { value: resumeQuote });
  await resumeTx.wait();
  record(
    "market.purchase",
    `Visionary A increased stake by 2 shares for ${formatEth(resumeQuote)}`,
    resumeTx.hash
  );

  await mark.connect(validatorA).castRiskVote(true);
  record("oracle.vote", `Validator ${validatorA.address} signalled CONFIDENCE`);
  await mark.connect(validatorB).castRiskVote(true);
  record("oracle.vote", `Validator ${validatorB.address} signalled CONFIDENCE`);

  const preFinalAttempt = await mark.quoteBuyShares(1);
  try {
    await mark.connect(owner).finalizeLaunch(owner.address);
  } catch (error) {
    record("launch.check", "Finalisation attempted prior to funding threshold", shortError(error));
  }

  await mark.connect(validatorC).castRiskVote(false);
  record("oracle.vote", `Validator ${validatorC.address} flagged residual risk (REJECT)`);
  await mark.connect(validatorC).clearRiskVote();
  await mark.connect(validatorC).castRiskVote(true);
  record("oracle.vote", `Validator ${validatorC.address} reaffirmed approval after deliberation`);

  const sovereignFactory = await ethers.getContractFactory("AlphaSovereignVault");
  const sovereign = await sovereignFactory
    .connect(owner)
    .deploy(owner.address, "Launch α-AGI Sovereign mission-control treasury");
  await sovereign.waitForDeployment();
  record("deploy.sovereign", `Sovereign vault deployed at ${await sovereign.getAddress()}`);

  const reserveBeforeLaunch = await mark.reserveBalance();
  const finalizeTx = await mark
    .connect(owner)
    .finalizeLaunch(await sovereign.getAddress());
  await finalizeTx.wait();
  record(
    "launch.finalise",
    `Green-flamed Nova-Seed elevated to Sovereign with ${formatEth(reserveBeforeLaunch)} treasury`,
    finalizeTx.hash
  );

  try {
    await mark.connect(investorB).buyShares(1, { value: preFinalAttempt });
  } catch (error) {
    record("launch.locked", "Post-launch trading correctly sealed", shortError(error));
  }

  const shareBalances = [
    { address: investorA.address, shares: (await mark.shareBalanceOf(investorA.address)).toString() },
    { address: investorB.address, shares: (await mark.shareBalanceOf(investorB.address)).toString() },
    { address: investorC.address, shares: (await mark.shareBalanceOf(investorC.address)).toString() },
  ];

  const [validatorAddresses, validatorVotes] = await mark.validators();
  const voteMap = validatorVotes.map((vote, index) => {
    const code = Number(vote);
    const status = code === 1 ? "Approve" : code === 2 ? "Reject" : "None";
    return {
      validator: validatorAddresses[index],
      voteCode: code,
      status,
    };
  });

  const summary = {
    seed: {
      contract: await nova.getAddress(),
      tokenId: seedTokenId.toString(),
      holder: await mark.getAddress(),
    },
    mark: {
      contract: await mark.getAddress(),
      basePrice: formatEth(basePrice),
      slope: formatEth(slope),
      totalShares: (await mark.totalShares()).toString(),
      reserveRaised: formatEth(reserveBeforeLaunch),
      currentPrice: formatEth(await mark.currentPrice()),
      whitelistEnabled: await mark.whitelistEnabled(),
      launched: await mark.launched(),
      seedValidated: await mark.seedValidated(),
      shareBalances,
      validatorVotes: voteMap,
    },
    sovereign: {
      contract: await sovereign.getAddress(),
      mission: await sovereign.mission(),
      balance: formatEth(await ethers.provider.getBalance(await sovereign.getAddress())),
    },
  };

  const repoRoot = path.resolve(__dirname, "../../..");
  const reportDir = path.join(repoRoot, "reports", "alpha-agi-mark");
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(
    path.join(reportDir, "ledger.json"),
    JSON.stringify({ ledger }, null, 2),
    "utf8"
  );
  await fs.writeFile(
    path.join(reportDir, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  console.log("\nα-AGI MARK demo complete. Summary persisted to reports/alpha-agi-mark/summary.json\n");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("α-AGI MARK demo failed", error);
    process.exitCode = 1;
  });
}
