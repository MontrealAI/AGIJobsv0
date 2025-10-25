#!/usr/bin/env ts-node

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const DEMO_ROOT = join(__dirname, "..");
const ORCHESTRATOR = join(__dirname, "run-kardashev-demo.ts");

function runOrchestratorCheck() {
  const result = spawnSync(
    "npx",
    [
      "ts-node",
      "--compiler-options",
      '{"module":"commonjs"}',
      ORCHESTRATOR,
      "--check",
    ],
    { stdio: "inherit", cwd: join(__dirname, "..", "..", "..") }
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
    "## 🎛️ Mission directives & verification dashboards",
    "## 🔭 Scenario stress sweep",
    "## 🧬 Stability ledger & unstoppable consensus",
    "## 🛡️ Governance and safety levers",
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
