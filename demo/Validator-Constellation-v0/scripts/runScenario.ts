#!/usr/bin/env ts-node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  runDemoOrchestration,
  type DemoOrchestrationOptions,
} from "../src/demoOrchestrator";
import type { Domain } from "../src/config/entities";
import type { GovernanceParameters } from "../src/config/defaults";

interface CliArgs {
  readonly config?: string;
}

interface ScenarioOverrides {
  readonly governance?: Partial<GovernanceParameters>;
  readonly domainBudgets?: Partial<Record<Domain, string | number>>;
  readonly jobCount?: number;
  readonly roundSeed?: string;
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option("config", {
      type: "string",
      describe: "Path to JSON file overriding defaults",
    })
    .parseSync() as CliArgs;

  let options: DemoOrchestrationOptions = {};

  if (argv.config) {
    const path = resolve(process.cwd(), argv.config);
    const overrides = JSON.parse(readFileSync(path, "utf8")) as ScenarioOverrides;

    let next: DemoOrchestrationOptions = { ...options };
    if (overrides.domainBudgets) {
      const budgets: Partial<Record<Domain, bigint>> = {};
      for (const [domain, value] of Object.entries(
        overrides.domainBudgets
      ) as [Domain, string | number][]) {
        budgets[domain] = BigInt(value);
      }
      if (Object.keys(budgets).length > 0) {
        next = { ...next, domainBudgetOverrides: budgets };
      }
    }
    if (overrides.governance) {
      next = { ...next, governanceOverrides: overrides.governance };
    }
    if (typeof overrides.jobCount === "number") {
      next = { ...next, jobCount: overrides.jobCount };
    }
    if (typeof overrides.roundSeed === "string") {
      next = { ...next, roundSeed: overrides.roundSeed };
    }
    options = next;
    console.log(`Loaded overrides from ${path}`);
  }

  const result = await runDemoOrchestration(options);
  const replacer = (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value;
  console.log(JSON.stringify(result, replacer, 2));
}

main().catch((error) => {
  console.error("Scenario run failed", error);
  process.exitCode = 1;
});
