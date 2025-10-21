import { readFile } from "fs/promises";
import { executeSynthesis, resolveRunOptions, type RunOptions } from "./runSynthesis";
import { inspectCommand, loadPackageScripts } from "./commandValidation";

function parseArgs(argv: string[]): RunOptions {
  const options: RunOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mission" && index + 1 < argv.length) {
      options.missionFile = argv[index + 1];
      index += 1;
    } else if (arg === "--report-dir" && index + 1 < argv.length) {
      options.reportDir = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function printDivider(label: string): void {
  const padding = Math.max(0, 72 - label.length - 2);
  const line = `${"=".repeat(Math.floor(padding / 2))} ${label.toUpperCase()} ${"=".repeat(Math.ceil(padding / 2))}`;
  console.log(line);
}

async function main(): Promise<void> {
  const cliOptions = parseArgs(process.argv.slice(2));
  const run = await executeSynthesis(cliOptions);
  const resolved = resolveRunOptions(cliOptions);
  const scripts = await loadPackageScripts();
  printDivider("Meta-Agentic Program Synthesis");
  console.log(`Mission: ${run.mission.meta.title}`);
  console.log(`Generated at: ${run.generatedAt}`);
  console.log(`Owner readiness: ${run.ownerCoverage.readiness}`);
  console.log(`Accuracy: ${(run.aggregate.averageAccuracy * 100).toFixed(2)}% | Novelty: ${(run.aggregate.noveltyScore * 100).toFixed(2)}%`);
  console.log(`Thermodynamic alignment: ${(run.aggregate.thermodynamics.averageAlignment * 100).toFixed(2)}%`);
  console.log(
    `Owner supremacy → coverage ${(run.aggregate.ownerSupremacy.coverageRatio * 100).toFixed(2)}% | scripts ${(run.aggregate.ownerSupremacy.scriptAvailability * 100).toFixed(2)}% (${run.aggregate.ownerSupremacy.availableScripts}/${run.aggregate.ownerSupremacy.declaredScripts}) | commands ${(run.aggregate.ownerSupremacy.commandAvailability * 100).toFixed(2)}% (${run.aggregate.ownerSupremacy.commandAvailable}/${run.aggregate.ownerSupremacy.commandDeclared}) | verifications ${(run.aggregate.ownerSupremacy.verificationAvailability * 100).toFixed(2)}% (${run.aggregate.ownerSupremacy.verificationAvailable}/${run.aggregate.ownerSupremacy.verificationDeclared}) | readiness ${run.aggregate.ownerSupremacy.readiness}`,
  );
  console.log("");
  printDivider("Owner Controls");
  for (const capability of run.mission.ownerControls.capabilities) {
    const commandStatus = inspectCommand(capability.command, scripts) ? "✅" : "❌";
    const verificationStatus = inspectCommand(capability.verification, scripts) ? "✅" : "❌";
    console.log(`${commandStatus}/${verificationStatus} ${capability.category} → ${capability.command} | verify ${capability.verification}`);
  }
  console.log("");
  printDivider("Task Highlights");
  for (const task of run.tasks) {
    const metrics = task.bestCandidate.metrics;
    console.log(`• ${task.task.label}: score ${metrics.score.toFixed(2)}, accuracy ${(metrics.accuracy * 100).toFixed(2)}%, novelty ${(metrics.novelty * 100).toFixed(1)}%, energy ${metrics.energy.toFixed(2)} (status ${task.thermodynamics.status})`);
  }
  console.log("");
  if (run.ownerBriefingPath) {
    printDivider("Owner Briefing Snapshot");
    const briefing = await readFile(run.ownerBriefingPath, "utf8");
    const excerpt = briefing.split(/\n/).slice(0, 40).join("\n");
    console.log(excerpt);
    if (briefing.includes("##")) {
      console.log("...");
    }
    console.log("");
    console.log(`Full briefing: ${run.ownerBriefingPath}`);
  }
  console.log(`Manifest updated at ${resolved.manifestFile}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to render owner briefing:", error);
    process.exitCode = 1;
  });
}
