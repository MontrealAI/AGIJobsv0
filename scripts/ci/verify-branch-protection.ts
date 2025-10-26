#!/usr/bin/env ts-node
import { execSync } from "node:child_process";
import { exit } from "node:process";

type ResultRow = {
  label: string;
  pass: boolean;
  detail?: string;
};

type Args = {
  owner?: string;
  repo?: string;
  branch: string;
  token?: string;
};

const EXPECTED_CONTEXTS = [
  "ci (v2) / Lint & static checks",
  "ci (v2) / Tests",
  "ci (v2) / Foundry",
  "ci (v2) / Coverage thresholds",
  "ci (v2) / Phase 6 readiness",
  "ci (v2) / Phase 8 readiness",
  "ci (v2) / CI summary",
  "ci (v2) / Branch protection guard",
] as const;

type BranchProtectionResponse = {
  required_status_checks?: {
    contexts?: string[];
    strict?: boolean;
  };
  enforce_admins?: {
    enabled?: boolean;
  };
};

function parseArgs(): Args {
  const parsed: Args = { branch: "main" };
  const [, , ...argv] = process.argv;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--owner":
        if (!next) {
          throw new Error("--owner requires a value");
        }
        parsed.owner = next;
        i += 1;
        break;
      case "--repo":
        if (!next) {
          throw new Error("--repo requires a value");
        }
        parsed.repo = next;
        i += 1;
        break;
      case "--branch":
        if (!next) {
          throw new Error("--branch requires a value");
        }
        parsed.branch = next;
        i += 1;
        break;
      case "--token":
        if (!next) {
          throw new Error("--token requires a value");
        }
        parsed.token = next;
        i += 1;
        break;
      case "-h":
      case "--help":
        printUsage();
        exit(0);
        break;
      default:
        console.warn(`Ignoring unknown option: ${arg}`);
        break;
    }
  }
  return parsed;
}

function printUsage(): void {
  console.log(
    "Usage: ts-node scripts/ci/verify-branch-protection.ts [--owner <org>] [--repo <name>] [--branch <branch>] [--token <token>]\n\n" +
      "Defaults:\n  --branch main\n  --owner/--repo derived from $GITHUB_REPOSITORY or git remote origin\n  --token uses $GITHUB_TOKEN, $GH_TOKEN, or $PAT\n",
  );
}

function deriveOwnerRepo(explicitOwner?: string, explicitRepo?: string): { owner: string; repo: string } {
  if (explicitOwner && explicitRepo) {
    return { owner: explicitOwner, repo: explicitRepo };
  }
  const envRepo = process.env.GITHUB_REPOSITORY;
  if (envRepo) {
    const [owner, repo] = envRepo.split("/");
    if (owner && repo) {
      return { owner, repo };
    }
  }
  try {
    const remoteUrl = execSync("git config --get remote.origin.url", { encoding: "utf8" }).trim();
    if (remoteUrl) {
      const match = /[:/]([^/]+)\/(.+?)\.git$/.exec(remoteUrl);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    }
  } catch (error) {
    console.warn("Failed to derive owner/repo from git remote", error);
  }
  throw new Error("Unable to determine repository owner and name. Provide --owner and --repo explicitly or set GITHUB_REPOSITORY.");
}

function resolveToken(explicitToken?: string): string {
  const token = explicitToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.PAT;
  if (!token) {
    throw new Error("Missing GitHub token. Provide --token or set GITHUB_TOKEN/GH_TOKEN/PAT.");
  }
  return token;
}

async function fetchProtection(owner: string, repo: string, branch: string, token: string): Promise<BranchProtectionResponse> {
  const url = `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "agijobs-branch-protection-audit",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed with ${response.status} ${response.statusText}: ${text}`);
  }

  return (await response.json()) as BranchProtectionResponse;
}

function evaluate(protection: BranchProtectionResponse): ResultRow[] {
  const rows: ResultRow[] = [];
  const contexts = protection.required_status_checks?.contexts ?? [];
  const strict = Boolean(protection.required_status_checks?.strict);
  const adminsEnabled = Boolean(protection.enforce_admins?.enabled);

  const missing = EXPECTED_CONTEXTS.filter((ctx) => !contexts.includes(ctx));
  rows.push({
    label: "Required contexts present",
    pass: missing.length === 0,
    detail: missing.length ? `Missing: ${missing.join(", ")}` : `All ${EXPECTED_CONTEXTS.length} contexts found`,
  });

  const orderMatches = (() => {
    const filtered = contexts.filter((ctx) => EXPECTED_CONTEXTS.includes(ctx as typeof EXPECTED_CONTEXTS[number])) as string[];
    if (filtered.length !== EXPECTED_CONTEXTS.length) {
      return false;
    }
    return EXPECTED_CONTEXTS.every((ctx, index) => filtered[index] === ctx);
  })();
  rows.push({
    label: "Context order matches workflow",
    pass: orderMatches,
    detail: orderMatches ? "Contexts appear in documented order" : `Actual order: ${contexts.join(" → ") || "(none)"}`,
  });

  const extras = contexts.filter((ctx) => !EXPECTED_CONTEXTS.includes(ctx as typeof EXPECTED_CONTEXTS[number]));
  rows.push({
    label: "Additional required contexts",
    pass: true,
    detail: extras.length ? `Also enforced: ${extras.join(", ")}` : "No extra contexts",
  });

  rows.push({
    label: "Require branches to be up to date",
    pass: strict,
    detail: strict ? "strict=true" : "strict flag disabled",
  });

  rows.push({
    label: "Administrators blocked by checks",
    pass: adminsEnabled,
    detail: adminsEnabled ? "Include administrators enabled" : "Admins can bypass checks",
  });

  return rows;
}

function printReport(owner: string, repo: string, branch: string, rows: ResultRow[]): void {
  console.log(`Branch protection audit for ${owner}/${repo}@${branch}`);
  console.log("");
  const header = ["Status", "Check", "Detail"];
  const table = [header, ...rows.map((row) => [row.pass ? "✅" : "❌", row.label, row.detail ?? ""])] as string[][];
  const colWidths = header.map((_, idx) => Math.max(...table.map((r) => r[idx].length)));
  for (const line of table) {
    const formatted = line
      .map((cell, idx) => cell.padEnd(colWidths[idx] + (idx === line.length - 1 ? 0 : 2)))
      .join("");
    console.log(formatted.trimEnd());
  }
  console.log("");
}

async function main(): Promise<void> {
  try {
    const args = parseArgs();
    const { owner, repo } = deriveOwnerRepo(args.owner, args.repo);
    const token = resolveToken(args.token);
    const protection = await fetchProtection(owner, repo, args.branch, token);
    const rows = evaluate(protection);
    printReport(owner, repo, args.branch, rows);
    const failed = rows
      .filter((row) => row.label !== "Additional required contexts")
      .some((row) => !row.pass);
    if (failed) {
      console.error("Branch protection does not satisfy CI v2 guardrails.");
      exit(1);
    }
  } catch (error) {
    console.error((error as Error).message);
    exit(1);
  }
}

void main();
