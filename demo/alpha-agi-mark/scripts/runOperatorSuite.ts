import { spawnSync, SpawnSyncReturns } from "child_process";
import path from "path";

interface Step {
  label: string;
  command: string;
  args: string[];
}

function runStep(index: number, total: number, step: Step, env: NodeJS.ProcessEnv, cwd: string) {
  const banner = `[${index + 1}/${total}] ${step.label}`;
  console.log(`\n${banner}`);
  const start = Date.now();
  const result: SpawnSyncReturns<Buffer> = spawnSync(step.command, step.args, {
    cwd,
    stdio: "inherit",
    env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${step.label} failed with exit code ${result.status ?? "unknown"}`);
  }

  const elapsedMs = Date.now() - start;
  console.log(`   ✅ Completed ${step.label} in ${(elapsedMs / 1000).toFixed(2)}s`);
}

function main() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const demoDir = path.resolve(__dirname, "..");

  const network = process.env.ALPHA_MARK_NETWORK?.trim();
  const suiteEnv: NodeJS.ProcessEnv = { ...process.env };
  if (network && network.length > 0 && network !== "hardhat" && !suiteEnv.HARDHAT_NETWORK) {
    suiteEnv.HARDHAT_NETWORK = network;
    console.log(`ℹ️  Detected ALPHA_MARK_NETWORK=${network}; setting HARDHAT_NETWORK to match.`);
  }

  const hardhatArgs = [
    "hardhat",
    "run",
    "--config",
    path.join(demoDir, "hardhat.config.ts"),
  ];

  if (network && network.length > 0 && network !== "hardhat") {
    hardhatArgs.push("--network", network);
  }

  hardhatArgs.push(path.join(demoDir, "scripts", "runDemo.ts"));

  const tsNodeArgs = (script: string): string[] => [
    "ts-node",
    "--compiler-options",
    '{"module":"commonjs"}',
    path.join(demoDir, "scripts", script),
  ];

  const steps: Step[] = [
    { label: "α-AGI MARK orchestrator", command: "npx", args: hardhatArgs },
    { label: "Owner parameter matrix", command: "npx", args: tsNodeArgs("exportOwnerMatrix.ts") },
    { label: "Triple-verification replay", command: "npx", args: tsNodeArgs("verifyRecap.ts") },
    { label: "Integrity dossier synthesis", command: "npx", args: tsNodeArgs("generateIntegrityReport.ts") },
    { label: "Risk lattice synthesis", command: "npx", args: tsNodeArgs("generateRiskLattice.ts") },
    { label: "Empowerment pulse dossier", command: "npx", args: tsNodeArgs("generateEmpowermentPulse.ts") },
  ];

  const suiteStart = Date.now();
  steps.forEach((step, index) => runStep(index, steps.length, step, suiteEnv, repoRoot));

  const recapPath = path.join(demoDir, "reports", "alpha-mark-recap.json");
  const dashboardPath = path.join(demoDir, "reports", "alpha-mark-dashboard.html");
  const integrityPath = path.join(demoDir, "reports", "alpha-mark-integrity.md");
  const ownerMatrixNote = "Run `npm run owner:alpha-agi-mark` to re-print the owner matrix at any time.";
  const latticePath = path.join(demoDir, "reports", "alpha-mark-risk-lattice.md");
  const empowermentPath = path.join(demoDir, "reports", "alpha-mark-empowerment.md");

  const elapsed = ((Date.now() - suiteStart) / 1000).toFixed(2);
  console.log(`\n🌌 α-AGI MARK operator suite complete in ${elapsed}s.`);
  console.log(`   • Recap dossier: ${path.relative(repoRoot, recapPath)}`);
  console.log(`   • Sovereign dashboard: ${path.relative(repoRoot, dashboardPath)}`);
  console.log(`   • Integrity report: ${path.relative(repoRoot, integrityPath)}`);
  console.log(`   • Risk lattice dossier: ${path.relative(repoRoot, latticePath)}`);
  console.log(`   • Empowerment pulse: ${path.relative(repoRoot, empowermentPath)}`);
  console.log(`   • ${ownerMatrixNote}`);
}

try {
  main();
} catch (error) {
  console.error("❌ α-AGI MARK operator suite aborted:", (error as Error).message ?? error);
  process.exitCode = 1;
}
