#!/usr/bin/env ts-node
import chalk from "chalk";
import { formatEther } from "ethers";
import { runDemoOrchestration } from "../src/demoOrchestrator";
import { allowlistFingerprint } from "../src/config/defaults";

async function main() {
  console.log(chalk.cyan.bold("🚀 Launching Validator Constellation Demo"));
  console.log(
    chalk.gray(`Allowlist fingerprint: ${allowlistFingerprint.substring(0, 18)}…`)
  );

  const result = await runDemoOrchestration();

  console.log(chalk.green(`\nValidators registered: ${result.validatorCount}`));
  console.log(chalk.yellow(`Committee draw:`));
  for (const validator of result.committee) {
    console.log(
      `  • ${chalk.bold(validator.ensName)} (${validator.address.slice(0, 10)}…)`
    );
  }

  console.log(chalk.blue(`\nCommit–reveal finalization`));
  console.log(`  Approved: ${result.finalization.approved}`);
  console.log(`  Votes for: ${result.finalization.votesFor}`);
  console.log(`  Votes against: ${result.finalization.votesAgainst}`);
  console.log(`  Slashed validators: ${result.finalization.slashed.length}`);

  console.log(chalk.magenta(`\nZK Batch Proof`));
  console.log(`  Batch ID: ${result.zkProof.batchId}`);
  console.log(`  Batch size: ${result.zkProof.batchSize}`);
  console.log(`  Digest: ${result.zkProof.digest.slice(0, 18)}…`);

  if (result.sentinelAlerts.length > 0) {
    console.log(chalk.red(`\nSentinel alerts triggered:`));
    for (const alert of result.sentinelAlerts) {
      console.log(
        `  ⚠️  ${alert.ensName} (${alert.domain}) → ${alert.reason} [${new Date(
          alert.timestamp
        ).toISOString()}]`
      );
    }
  } else {
    console.log(chalk.green("Sentinel: all domains healthy"));
  }

  const config = result.configuration;
  console.log(chalk.cyan(`\nGovernance controls`));
  console.log(
    `  Quorum: ${config.governance.quorum} of ${config.governance.committeeSize}`
  );
  console.log(
    `  Commit deadline: ${config.governance.commitDeadlineSeconds}s`
  );
  console.log(
    `  Reveal deadline: ${config.governance.revealDeadlineSeconds}s`
  );
  const nonRevealPercent = (
    config.governance.nonRevealSlashBps / 100
  ).toFixed(2);
  const dishonestPercent = (
    config.governance.dishonestSlashBps / 100
  ).toFixed(2);
  console.log(`  Non-reveal slash: ${nonRevealPercent}%`);
  console.log(`  Dishonest slash: ${dishonestPercent}%`);
  console.log(
    `  Sentinel pause SLA: ${config.sentinelPauseSlaSeconds}s`
  );
  console.log(`  Round seed: ${config.roundSeed}`);
  console.log(`  Jobs per batch proof: ${config.jobCount}`);

  console.log(chalk.cyan(`\nDomain budgets`));
  for (const [domain, budgetWei] of Object.entries(config.domainBudgets)) {
    const formatted = formatEther(BigInt(budgetWei));
    console.log(`  • ${domain}: ${formatted} ETH`);
  }

  console.log(chalk.gray("\nEvent feed exported to operator console."));
}

main().catch((error) => {
  console.error(chalk.red("Demo failed:"), error);
  process.exitCode = 1;
});
