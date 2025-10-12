#!/usr/bin/env ts-node
import { spawnSync, SpawnSyncReturns } from "node:child_process";
import path from "node:path";
import process from "node:process";

type StepStatus = "passed" | "failed" | "skipped" | "warning";

type StepResult = {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  docs?: string;
};

type Step = {
  id: string;
  label: string;
  command: string[];
  docs?: string;
  optional?: boolean;
  skip?: boolean;
  skipReason?: string;
  env?: NodeJS.ProcessEnv;
  treatMissingTokenAsWarning?: boolean;
};

type Options = {
  owner?: string;
  repo?: string;
  branch: string;
  token?: string;
  skipBranchProtection: boolean;
  includeOwnerCheck: boolean;
  includeDossier: boolean;
  dryRun: boolean;
};

function printUsage(): void {
  console.log(
    "Usage: npm run audit:final [options]\n\n" +
      "Options:\n" +
      "  --full                     Run all checks, including owner control and dossier export.\n" +
      "  --with-owner-check         Include the owner control verification step.\n" +
      "  --with-dossier             Include the audit dossier export.\n" +
      "  --skip-owner-check         Skip the owner control step even in --full mode.\n" +
      "  --skip-dossier             Skip the dossier export even in --full mode.\n" +
      "  --skip-branch-protection   Do not run the branch protection verifier.\n" +
      "  --owner <org>              Override repository owner for branch protection.\n" +
      "  --repo <name>              Override repository name for branch protection.\n" +
      "  --branch <branch>          Branch to inspect (default: main).\n" +
      "  --token <token>            GitHub token for branch protection checks (falls back to env).\n" +
      "  --dry-run                  Print commands without executing them.\n" +
      "  -h, --help                 Show this message.\n",
  );
}

function parseArgs(): Options {
  const options: Options = {
    branch: "main",
    skipBranchProtection: false,
    includeOwnerCheck: false,
    includeDossier: false,
    dryRun: false,
  };

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--full":
        options.includeOwnerCheck = true;
        options.includeDossier = true;
        break;
      case "--with-owner-check":
        options.includeOwnerCheck = true;
        break;
      case "--with-dossier":
        options.includeDossier = true;
        break;
      case "--skip-owner-check":
        options.includeOwnerCheck = false;
        break;
      case "--skip-dossier":
        options.includeDossier = false;
        break;
      case "--skip-branch-protection":
        options.skipBranchProtection = true;
        break;
      case "--owner":
      case "--repo":
      case "--branch":
      case "--token": {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        if (arg === "--owner") {
          options.owner = value;
        } else if (arg === "--repo") {
          options.repo = value;
        } else if (arg === "--branch") {
          options.branch = value;
        } else {
          options.token = value;
        }
        i += 1;
        break;
      }
      case "--dry-run":
        options.dryRun = true;
        break;
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function formatCommand(command: string[]): string {
  return command
    .map((segment) => {
      if (/^[0-9A-Za-z._\-/:]+$/.test(segment)) {
        return segment;
      }
      return JSON.stringify(segment);
    })
    .join(" ");
}

function runStep(step: Step, options: Options): StepResult {
  if (step.skip) {
    return {
      id: step.id,
      label: step.label,
      status: "skipped",
      detail: step.skipReason ?? "Skipped",
      docs: step.docs,
    };
  }

  if (options.dryRun) {
    console.log(`\n[DRY RUN] ${step.label}\nCommand: ${formatCommand(step.command)}`);
    return {
      id: step.id,
      label: step.label,
      status: "skipped",
      detail: "Dry run: command not executed",
      docs: step.docs,
    };
  }

  console.log(`\n▶ ${step.label}`);
  console.log(`Command: ${formatCommand(step.command)}`);

  const result: SpawnSyncReturns<string> = spawnSync(step.command[0], step.command.slice(1), {
    cwd: process.cwd(),
    env: { ...process.env, ...step.env },
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    const isMissing = (result.error as NodeJS.ErrnoException).code === "ENOENT";
    const detail = isMissing ? `Command not found: ${step.command[0]}` : result.error.message;
    return {
      id: step.id,
      label: step.label,
      status: step.optional ? "warning" : "failed",
      detail,
      docs: step.docs,
    };
  }

  if (result.status === 0) {
    return {
      id: step.id,
      label: step.label,
      status: "passed",
      detail: undefined,
      docs: step.docs,
    };
  }

  const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  if (step.treatMissingTokenAsWarning && /Missing GitHub token/i.test(combinedOutput)) {
    return {
      id: step.id,
      label: step.label,
      status: "warning",
      detail: "GitHub token missing. Set GITHUB_TOKEN (repo scope) to verify branch protection.",
      docs: step.docs,
    };
  }

  if (step.id === "branch" && /Unable to determine repository owner and name/i.test(combinedOutput)) {
    return {
      id: step.id,
      label: step.label,
      status: "warning",
      detail: "Provide --owner/--repo or set GITHUB_REPOSITORY before running the branch audit.",
      docs: step.docs,
    };
  }

  return {
    id: step.id,
    label: step.label,
    status: step.optional ? "warning" : "failed",
    detail: `Command exited with code ${result.status ?? 1}`,
    docs: step.docs,
  };
}

function summarise(results: StepResult[]): void {
  console.log("\n=== Final readiness summary ===");
  const labelWidth = Math.max(...results.map((r) => r.label.length));
  for (const result of results) {
    const icon =
      result.status === "passed"
        ? "✅"
        : result.status === "warning"
        ? "⚠️"
        : result.status === "skipped"
        ? "⏭️"
        : "❌";
    const statusText = result.status.toUpperCase().padEnd(8);
    const detail = result.detail ? ` – ${result.detail}` : "";
    const docs = result.docs ? ` [${result.docs}]` : "";
    console.log(`${icon} ${result.label.padEnd(labelWidth)} ${statusText}${detail}${docs}`);
  }
}

function main(): void {
  const rootDir = path.resolve(__dirname, "..", "..");
  process.chdir(rootDir);

  let options: Options;
  try {
    options = parseArgs();
  } catch (error) {
    console.error((error as Error).message);
    printUsage();
    process.exit(1);
    return;
  }

  const steps: Step[] = [];

  steps.push({
    id: "freeze",
    label: "Code freeze guard",
    command: [process.execPath, path.join("scripts", "audit", "check-freeze.js")],
    docs: "docs/audit/final-verification-playbook.md",
  });

  const branchCommand = [
    "npx",
    "ts-node",
    "--compiler-options",
    '{"module":"commonjs"}',
    path.join("scripts", "ci", "verify-branch-protection.ts"),
  ];

  if (options.owner) {
    branchCommand.push("--owner", options.owner);
  }
  if (options.repo) {
    branchCommand.push("--repo", options.repo);
  }
  if (options.branch) {
    branchCommand.push("--branch", options.branch);
  }

  steps.push({
    id: "branch",
    label: "Branch protection (CI v2)",
    command: branchCommand,
    docs: "docs/v2-ci-operations.md",
    skip: options.skipBranchProtection,
    skipReason: "Skipped via --skip-branch-protection",
    env: options.token ? { ...process.env, GITHUB_TOKEN: options.token } : undefined,
    treatMissingTokenAsWarning: true,
  });

  if (options.includeOwnerCheck) {
    steps.push({
      id: "owner",
      label: "Owner control verification",
      command: ["npm", "run", "owner:verify-control"],
      docs: "docs/owner-control-parameter-playbook.md",
    });
  }

  if (options.includeDossier) {
    steps.push({
      id: "dossier",
      label: "Audit dossier export",
      command: ["npm", "run", "audit:dossier"],
      docs: "docs/AUDIT_DOSSIER.md",
    });
  }

  const results = steps.map((step) => runStep(step, options));
  summarise(results);

  const hasFailure = results.some((result) => result.status === "failed");
  if (hasFailure) {
    process.exit(1);
  }
}

main();

