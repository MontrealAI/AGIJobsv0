#!/usr/bin/env ts-node
import chalk from "chalk";
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

  console.log(chalk.gray("\nEvent feed exported to operator console."));
}

main().catch((error) => {
  console.error(chalk.red("Demo failed:"), error);
  process.exitCode = 1;
});
