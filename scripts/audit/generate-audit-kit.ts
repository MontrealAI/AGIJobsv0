#!/usr/bin/env ts-node
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type OutputFormat = "markdown" | "json";

type Section = {
  title: string;
  description?: string;
  checklist: string[];
};

type CommandEntry = {
  label: string;
  command: string;
  reference: string;
};

type AuditKit = {
  generatedAt: string;
  repository: string;
  format: OutputFormat;
  sections: Section[];
  commands: CommandEntry[];
  artefacts: string[];
};

function printHelp(): void {
  console.log(
    "Usage: npm run audit:kit [--output <file>] [--format markdown|json] [--force]\n\n" +
      "Generates a consolidated External Audit Launch Kit that packages the critical\n" +
      "checklists, commands, and artefact expectations demanded by the\n" +
      '"Recommended Next Coding Sprint: External Audit & Final Verification" brief.'
  );
}

function parseArgs(): {
  outputPath?: string;
  format: OutputFormat;
  force: boolean;
} {
  const args = process.argv.slice(2);
  const result: { outputPath?: string; format: OutputFormat; force: boolean } = {
    format: "markdown",
    force: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--output": {
        const value = args[i + 1];
        if (!value) {
          throw new Error("--output requires a value");
        }
        result.outputPath = value;
        i += 1;
        break;
      }
      case "--format": {
        const value = args[i + 1];
        if (value !== "markdown" && value !== "json") {
          throw new Error("--format must be 'markdown' or 'json'");
        }
        result.format = value;
        i += 1;
        break;
      }
      case "--force":
        result.force = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

function resolveRepo(): string {
  const envRepo = process.env.GITHUB_REPOSITORY;
  if (envRepo) {
    return envRepo;
  }

  try {
    const { execSync } = require("node:child_process");
    const origin = execSync("git config --get remote.origin.url", {
      encoding: "utf8",
    })
      .trim()
      .replace(/\.git$/, "");

    if (origin.includes("github.com")) {
      const cleaned = origin
        .replace(/^git@github.com:/, "")
        .replace(/^https:\/\/github.com\//, "");
      return cleaned;
    }
  } catch (error) {
    console.warn(
      `Warning: unable to determine repository from git remote (${(error as Error).message}).`
    );
  }

  return "MontrealAI/AGIJobsv0";
}

function buildKit(format: OutputFormat): AuditKit {
  const generatedAt = new Date().toISOString();
  const repository = resolveRepo();

  const sections: Section[] = [
    {
      title: "Audit Preparation & Code Freeze",
      description:
        "Execute the freeze guardrails and capture the dossier before auditors begin.",
      checklist: [
        "Run `npm run audit:freeze` from a clean `main` checkout to assert branch parity and cleanliness.",
        "Execute `npm run audit:final -- --full` to chain the freeze guard, branch protection verification, owner control proof, and dossier export.",
        "Record the generated dossier hash and attach it to the owner control change ticket for tamper-evident traceability.",
        "Announce the code-freeze window. Only ship emergency fixes with regenerated dossier artefacts until the audit concludes.",
      ],
    },
    {
      title: "Support Auditors & Issue Remediation",
      description:
        "Keep remediation loops short and auditable when findings arrive.",
      checklist: [
        "Share `docs/AUDIT_DOSSIER.md` and `docs/owner-control-atlas.md` with auditors for architecture context.",
        "For every finding, ship a focused PR with reproducing tests and rerun `npm run audit:dossier` before merging.",
        "Attach owner-control verification output to remediation tickets so governance retains full visibility.",
      ],
    },
    {
      title: "Optional Formal Verification",
      description:
        "Supplement property tests with formal proofs on the pause, staking, and treasury invariants.",
      checklist: [
        "Instrument Scribble or Verx specifications around `StakeManager`, `FeePool`, and `SystemPause`.",
        "Archive generated proofs alongside the audit dossier and reference them from the change ticket.",
      ],
    },
    {
      title: "Testnet Deployment & Dry-Run",
      description:
        "Rehearse the production deployment on Sepolia/Goerli with the audited artefacts.",
      checklist: [
        "Deploy using `npm run deploy:oneclick` or `npm run migrate:sepolia` and capture manifests in `reports/<network>/`.",
        "Exercise pause/unpause and parameter edits via `npm run owner:command-center -- --network <net>` and `npm run pause:test`.",
        "Validate orchestrator workflows end-to-end and archive CLI outputs for later comparison with mainnet runs.",
      ],
    },
    {
      title: "Post-Audit Hardening & Sign-Off",
      description:
        "Reconfirm production configuration and monitoring before lifting the freeze.",
      checklist: [
        "Compare governance addresses against manifests using `npm run owner:verify-control`.",
        "Refresh monitoring hooks with `npm run monitoring:validate` and propagate any new alerts.",
        "Lift the freeze only after tagging the release with dossier, manifest, and verification artefacts attached.",
      ],
    },
  ];

  const commands: CommandEntry[] = [
    {
      label: "Freeze guardrail",
      command: "npm run audit:freeze",
      reference: "docs/audit/final-verification-playbook.md#1-audit-preparation--code-freeze",
    },
    {
      label: "End-to-end readiness sweep",
      command: "npm run audit:final -- --full",
      reference: "scripts/audit/final-readiness.ts",
    },
    {
      label: "Export dossier",
      command: "npm run audit:dossier",
      reference: "docs/AUDIT_DOSSIER.md",
    },
    {
      label: "Verify owner control",
      command: "npm run owner:verify-control",
      reference: "docs/owner-control-parameter-playbook.md",
    },
    {
      label: "Validate monitoring",
      command: "npm run monitoring:validate",
      reference: "monitoring/prometheus/rules.yaml",
    },
  ];

  const artefacts = [
    "`reports/audit/` — Logs, summary.json, and optional Slither output from the dossier export.",
    "`reports/release-manifest.json` — Deterministic manifest for the audited deployment.",
    "`coverage/` & gas snapshots — Coverage HTML, access-control metrics, and gas baselines for diffing.",
    "`docs/` selections — Especially the owner-control suite, deployment runbooks, and monitoring guides for non-technical reviewers.",
  ];

  return { generatedAt, repository, format, sections, commands, artefacts };
}

function renderMarkdown(kit: AuditKit): string {
  const lines: string[] = [];
  lines.push("# AGI Jobs v0 — External Audit Launch Kit");
  lines.push("");
  lines.push(`Generated: ${kit.generatedAt}`);
  lines.push(`Repository: ${kit.repository}`);
  lines.push("");
  lines.push(
    "> This launch kit distils the external audit sprint requirements into an actionable" +
      " checklist for non-technical coordinators. Follow it alongside the detailed" +
      " [External Audit & Final Verification Playbook](docs/audit/final-verification-playbook.md) to keep the codebase frozen," +
      " prove owner control, and ship audit artefacts without drift."
  );
  lines.push("");

  for (const section of kit.sections) {
    lines.push(`## ${section.title}`);
    if (section.description) {
      lines.push("");
      lines.push(section.description);
    }
    lines.push("");
    for (const item of section.checklist) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }

  lines.push("## Command Reference");
  lines.push("");
  lines.push("| Task | Command | Reference |");
  lines.push("| --- | --- | --- |");
  for (const entry of kit.commands) {
    lines.push(`| ${entry.label} | \`$ ${entry.command}\` | ${entry.reference} |`);
  }
  lines.push("");

  lines.push("## Artefact Bundle Checklist");
  lines.push("");
  for (const artefact of kit.artefacts) {
    lines.push(`- [ ] ${artefact}`);
  }
  lines.push("");

  lines.push(
    "Once the checkboxes above are marked complete, capture the rendered Markdown, bundle the artefacts, and hand the package to the external auditors along with the CI v2 status page."
  );

  return lines.join("\n");
}

function main(): void {
  let options;
  try {
    options = parseArgs();
  } catch (error) {
    console.error((error as Error).message);
    printHelp();
    process.exit(1);
    return;
  }

  const kit = buildKit(options.format);
  let output = "";

  if (options.format === "markdown") {
    output = renderMarkdown(kit);
  } else {
    output = JSON.stringify(kit, null, 2);
  }

  if (options.outputPath) {
    const resolved = path.resolve(process.cwd(), options.outputPath);
    if (!options.force) {
      try {
        const { accessSync, constants } = require("node:fs");
        accessSync(resolved, constants.F_OK);
        console.error(
          `Refusing to overwrite existing file ${resolved}. Pass --force to replace it.`
        );
        process.exit(1);
        return;
      } catch {
        // File does not exist; safe to write.
      }
    }

    writeFileSync(resolved, output, { encoding: "utf8" });
    console.log(`Audit launch kit written to ${resolved}`);
  } else {
    console.log(output);
  }
}

main();
