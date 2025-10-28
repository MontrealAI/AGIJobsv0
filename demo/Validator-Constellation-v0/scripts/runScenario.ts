#!/usr/bin/env ts-node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runDemoOrchestration } from "../src/demoOrchestrator";

interface CliArgs {
  readonly config?: string;
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option("config", {
      type: "string",
      describe: "Path to JSON file overriding defaults",
    })
    .parseSync() as CliArgs;

  if (argv.config) {
    const path = resolve(process.cwd(), argv.config);
    const overrides = JSON.parse(readFileSync(path, "utf8"));
    if (overrides.allowlistFingerprint) {
      throw new Error(
        "Allowlist fingerprint is anchored and cannot be overridden in demo"
      );
    }
    console.log(
      "Loaded overrides (demo currently uses deterministic configuration)."
    );
  }

  const result = await runDemoOrchestration();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Scenario run failed", error);
  process.exitCode = 1;
});
