#!/usr/bin/env ts-node
import Table from "cli-table3";
import chalk from "chalk";
import { formatEther } from "ethers";
import { runDemoOrchestration } from "../src/demoOrchestrator";

async function main() {
  const result = await runDemoOrchestration();

  console.log(chalk.bold.cyan("Validator Constellation — Operator Console"));
  console.log(chalk.gray(`Allowlist fingerprint: ${result.allowlistFingerprint}`));

  const committeeTable = new Table({ head: ["Validator", "Address", "Domain"] });
  for (const validator of result.committee) {
    committeeTable.push([
      validator.ensName,
      `${validator.address.slice(0, 10)}…`,
      validator.domain,
    ]);
  }
  console.log("\nCommittee Composition");
  console.log(committeeTable.toString());

  const alertsTable = new Table({ head: ["Domain", "Agent", "Reason"] });
  if (result.sentinelAlerts.length === 0) {
    alertsTable.push(["All", "-", "Healthy"]);
  } else {
    for (const alert of result.sentinelAlerts) {
      alertsTable.push([
        alert.domain,
        alert.ensName,
        alert.reason,
      ]);
    }
  }
  console.log("\nSentinel Alerts");
  console.log(alertsTable.toString());

  const config = result.configuration;
  const governanceTable = new Table({ head: ["Parameter", "Value"] });
  governanceTable.push(
    [
      "Quorum",
      `${config.governance.quorum} / ${config.governance.committeeSize}`,
    ],
    ["Commit deadline", `${config.governance.commitDeadlineSeconds}s`],
    ["Reveal deadline", `${config.governance.revealDeadlineSeconds}s`],
    [
      "Non-reveal slash",
      `${(config.governance.nonRevealSlashBps / 100).toFixed(2)}%`,
    ],
    [
      "Dishonest slash",
      `${(config.governance.dishonestSlashBps / 100).toFixed(2)}%`,
    ],
    ["Sentinel SLA", `${config.sentinelPauseSlaSeconds}s`],
    ["Round seed", config.roundSeed],
    ["Jobs / batch", `${config.jobCount}`]
  );

  console.log("\nGovernance Controls");
  console.log(governanceTable.toString());

  const budgetsTable = new Table({ head: ["Domain", "Budget (ETH)"] });
  for (const [domain, budgetWei] of Object.entries(config.domainBudgets)) {
    budgetsTable.push([domain, formatEther(BigInt(budgetWei))]);
  }
  console.log("\nDomain Budgets");
  console.log(budgetsTable.toString());

  console.log("\nRecent Events (tail 5)");
  const events = result.eventLog.slice(-5);
  for (const event of events) {
    console.log(
      `• ${chalk.yellow(event.type)} :: ${new Date(event.timestamp).toISOString()}`
    );
  }
}

main().catch((error) => {
  console.error("Operator console failed", error);
  process.exitCode = 1;
});
