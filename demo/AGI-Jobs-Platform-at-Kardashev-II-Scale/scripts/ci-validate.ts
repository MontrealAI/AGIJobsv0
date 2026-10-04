#!/usr/bin/env ts-node

import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";

const { resolveOptions } = require("./runtime.cjs");
const options = resolveOptions(resolve(__dirname, ".."));
const DEMO_ROOT = options.root;
const ORCHESTRATOR = join(__dirname, "run-kardashev-demo.ts");

function runOrchestratorCheck() {
  const args = [require.resolve("ts-node/dist/bin.js"), "--compiler-options", '{"module":"commonjs"}', ORCHESTRATOR,
    "--check", "--config-root", options.configRoot, "--output-dir", options.outputDir];
  if (options.root !== resolve(__dirname, "..")) args.push("--profile", options.root);
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
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
    "## 🪐 Mission lattice & task hierarchy",
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
