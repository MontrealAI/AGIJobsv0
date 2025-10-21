import path from "path";
import { loadMissionConfig, runMetaSynthesis } from "./synthesisEngine";
import { writeReports } from "./reporting";
import { updateManifest } from "./manifest";
import type { MissionConfig, OwnerControlCoverage, SynthesisRun } from "./types";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const DEFAULT_MISSION = path.join(BASE_DIR, "config", "mission.meta-agentic-program-synthesis.json");
const REPORT_FILE = path.join(REPORT_DIR, "meta-agentic-program-synthesis-report.md");
const SUMMARY_FILE = path.join(REPORT_DIR, "meta-agentic-program-synthesis-summary.json");
const DASHBOARD_FILE = path.join(REPORT_DIR, "meta-agentic-program-synthesis-dashboard.html");
const MANIFEST_FILE = path.join(REPORT_DIR, "meta-agentic-program-synthesis-manifest.json");
const TRIANGULATION_FILE = path.join(REPORT_DIR, "meta-agentic-program-synthesis-triangulation.json");
const BRIEFING_FILE = path.join(REPORT_DIR, "meta-agentic-program-synthesis-briefing.md");

export interface RunOptions {
  missionFile?: string;
  reportDir?: string;
  reportFile?: string;
  summaryFile?: string;
  dashboardFile?: string;
  manifestFile?: string;
  triangulationFile?: string;
  briefingFile?: string;
}

export function resolveRunOptions(options: RunOptions = {}): Required<RunOptions> {
  const missionFile = path.resolve(options.missionFile ?? process.env.AGI_META_PROGRAM_MISSION ?? DEFAULT_MISSION);
  const reportDir = path.resolve(options.reportDir ?? REPORT_DIR);
  const reportFile = path.resolve(options.reportFile ?? REPORT_FILE);
  const summaryFile = path.resolve(options.summaryFile ?? SUMMARY_FILE);
  const dashboardFile = path.resolve(options.dashboardFile ?? DASHBOARD_FILE);
  const manifestFile = path.resolve(options.manifestFile ?? MANIFEST_FILE);
  const triangulationFile = path.resolve(options.triangulationFile ?? TRIANGULATION_FILE);
  const briefingFile = path.resolve(options.briefingFile ?? BRIEFING_FILE);
  return {
    missionFile,
    reportDir,
    reportFile,
    summaryFile,
    dashboardFile,
    manifestFile,
    triangulationFile,
    briefingFile,
  };
}

export async function executeSynthesis(options: RunOptions = {}): Promise<SynthesisRun> {
  const resolved = resolveRunOptions(options);
  const { mission, coverage }: { mission: MissionConfig; coverage: OwnerControlCoverage } =
    await loadMissionConfig(resolved.missionFile);
  const run = runMetaSynthesis(mission, coverage);
  const { files, ownerScripts } = await writeReports(run, {
    reportDir: resolved.reportDir,
    markdownFile: resolved.reportFile,
    jsonFile: resolved.summaryFile,
    htmlFile: resolved.dashboardFile,
    triangulationFile: resolved.triangulationFile,
    briefingFile: resolved.briefingFile,
  });
  run.ownerScriptsAudit = ownerScripts;
  run.ownerBriefingPath = resolved.briefingFile;
  await updateManifest(resolved.manifestFile, files);
  return run;
}

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
    } else if (arg === "--manifest" && index + 1 < argv.length) {
      options.manifestFile = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

async function main(): Promise<void> {
  const cliOptions = parseArgs(process.argv.slice(2));
  const run = await executeSynthesis(cliOptions);
  console.log("✅ Meta-Agentic Program Synthesis dossier generated.");
  const resolved = resolveRunOptions(cliOptions);
  console.log(`   Mission: ${resolved.missionFile}`);
  console.log(`   Markdown report: ${resolved.reportFile}`);
  console.log(`   JSON summary: ${resolved.summaryFile}`);
  console.log(`   Dashboard: ${resolved.dashboardFile}`);
  console.log(`   Owner briefing: ${resolved.briefingFile}`);
  console.log(`   Triangulation digest: ${resolved.triangulationFile}`);
  console.log(`   Manifest: ${resolved.manifestFile}`);
  console.log(
    `   Aggregate → score ${run.aggregate.globalBestScore.toFixed(2)}, accuracy ${(run.aggregate.averageAccuracy * 100).toFixed(2)}%, novelty ${(run.aggregate.noveltyScore * 100).toFixed(1)}%`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to execute Meta-Agentic Program Synthesis demo:", error);
    process.exitCode = 1;
  });
}
