#!/usr/bin/env ts-node

import { spawnSync } from "node:child_process";
import { join, resolve, isAbsolute } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const rawArgs = process.argv.slice(2);

function resolveDemoRoot(): { root: string; profile?: string; explicitRoot?: string } {
  const defaultRoot = join(__dirname, "..");
  const repoRoot = resolve(defaultRoot, "..", "..", "..");

  let profile = process.env.KARDASHEV_DEMO_PROFILE?.trim();
  let explicitRoot = process.env.KARDASHEV_DEMO_ROOT?.trim();

  for (let i = 0; i < rawArgs.length; i += 1) {
    const token = rawArgs[i];
    if (token === "--profile" && rawArgs[i + 1]) {
      profile = rawArgs[i + 1];
      i += 1;
    } else if (token?.startsWith("--profile=")) {
      profile = token.split("=", 2)[1];
    } else if (token === "--config-root" && rawArgs[i + 1]) {
      explicitRoot = rawArgs[i + 1];
      i += 1;
    } else if (token?.startsWith("--config-root=")) {
      explicitRoot = token.split("=", 2)[1];
    }
  }

  if (profile && profile.length > 0) {
    const candidate = resolve(defaultRoot, profile);
    if (!existsSync(candidate)) {
      throw new Error(`Profile directory not found: ${candidate}`);
    }
    return { root: candidate, profile };
  }

  if (explicitRoot && explicitRoot.length > 0) {
    const candidate = isAbsolute(explicitRoot)
      ? explicitRoot
      : resolve(repoRoot, explicitRoot);
    if (!existsSync(candidate)) {
      throw new Error(`Config root override not found: ${candidate}`);
    }
    return { root: candidate, explicitRoot };
  }

  return { root: defaultRoot };
}

const { root: DEMO_ROOT, profile: PROFILE, explicitRoot: EXPLICIT_ROOT } = resolveDemoRoot();
const ORCHESTRATOR = join(__dirname, "run-kardashev-demo.ts");

function runOrchestratorCheck() {
  const env = {
    ...process.env,
    ...(PROFILE ? { KARDASHEV_DEMO_PROFILE: PROFILE } : {}),
    ...(EXPLICIT_ROOT ? { KARDASHEV_DEMO_ROOT: EXPLICIT_ROOT } : {}),
  };

  const result = spawnSync(
    "npx",
    [
      "ts-node",
      "--compiler-options",
      '{"module":"commonjs"}',
      ORCHESTRATOR,
      "--check",
      ...(PROFILE ? ["--profile", PROFILE] : []),
      ...(EXPLICIT_ROOT ? ["--config-root", EXPLICIT_ROOT] : []),
    ],
    { stdio: "inherit", cwd: join(__dirname, "..", "..", ".."), env }
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function validateReadme() {
  const readme = readFileSync(join(DEMO_ROOT, "README.md"), "utf8");
  const requiredHeadings = [
    "## 🧭 Ultra-deep readiness map",
    "## 🚀 Kardashev-II operator quickstart",
    "## 🧱 Architecture overview",
    "## 🪪 Identity lattice & trust fabric",
    "## 🛰️ Compute fabric hierarchy",
    "## 🔌 Energy & compute governance",
    "## ⚡ Live energy feed reconciliation",
    "## 🔋 Energy window scheduler & coverage ledger",
    "## 🚚 Interstellar logistics lattice",
    "## 🕸️ Sharded job fabric & routing ledger",
    "## 🎛️ Mission directives & verification dashboards",
    "## 🌐 Settlement lattice & forex fabric",
    "## ♾️ Consistency ledger & multi-angle verification",
    "## 🔭 Scenario stress sweep",
    "## 🧬 Stability ledger & unstoppable consensus",
    "## 🛡️ Governance and safety levers",
    "## 🗝️ Owner override proof deck",
    "## 📦 Artefacts in this directory",
    "## 🧪 Verification rituals",
    "## 🧠 Reflective checklist for owners",
  ];

  let failures = 0;
  for (const heading of requiredHeadings) {
    if (!readme.includes(heading)) {
      console.error(`❌ README missing heading: ${heading}`);
      failures += 1;
    }
  }

  const mermaidBlocks = (readme.match(/```mermaid/g) || []).length;
  if (mermaidBlocks < 2) {
    console.error("❌ README must contain at least two mermaid diagrams.");
    failures += 1;
  }

  if (failures > 0) {
    process.exit(failures);
  }
  console.log("✔ Kardashev-II README verified.");
}

runOrchestratorCheck();
validateReadme();
