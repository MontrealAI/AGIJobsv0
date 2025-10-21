import path from "path";
import os from "os";
import { mkdtemp, rm } from "fs/promises";
import { expect } from "chai";

import {
  loadMissionConfig,
  runMetaSynthesis,
} from "../../demo/Meta-Agentic-Program-Synthesis-v0/scripts/synthesisEngine";
import { executeSynthesis } from "../../demo/Meta-Agentic-Program-Synthesis-v0/scripts/runSynthesis";
import { ensureMissionValidity } from "../../demo/Meta-Agentic-Program-Synthesis-v0/scripts/validation";
import { signature } from "../../demo/Meta-Agentic-Program-Synthesis-v0/scripts/operations";
import type {
  MissionConfig,
  OwnerControlCoverage,
  SynthesisRun,
  TaskResult,
} from "../../demo/Meta-Agentic-Program-Synthesis-v0/scripts/types";

const missionPath = path.resolve(
  __dirname,
  "../../demo/Meta-Agentic-Program-Synthesis-v0/config/mission.meta-agentic-program-synthesis.json",
);

describe("Meta-Agentic Program Synthesis Sovereign mission", function () {
  this.timeout(60000);

  let mission: MissionConfig;
  let coverage: OwnerControlCoverage;
  let run: SynthesisRun;

  before(async function () {
    ({ mission, coverage } = await loadMissionConfig(missionPath));
    run = runMetaSynthesis(mission, coverage);
  });

  it("enforces owner supremacy prerequisites", function () {
    expect(coverage.readiness).to.equal("ready");
    expect(coverage.missingCategories).to.be.empty;
    expect(mission.ownerControls.capabilities).to.have.length.greaterThan(0);
    const invalidMission: MissionConfig = JSON.parse(JSON.stringify(mission));
    invalidMission.ownerControls.capabilities = invalidMission.ownerControls.capabilities.filter(
      (capability) => capability.category !== "Compliance",
    );
    expect(() => ensureMissionValidity(invalidMission)).to.throw(/missing required categories/i);
  });

  it("produces deterministic elite pipelines with perfect coverage", function () {
    expect(run.tasks).to.have.lengthOf.at.least(3);

    const baselineById = new Map<string, TaskResult>();
    for (const task of run.tasks) {
      baselineById.set(task.task.id, task);
      expect(task.bestCandidate.operations).to.not.be.empty;
      expect(task.bestCandidate.metrics.accuracy).to.equal(1);
      expect(task.bestCandidate.metrics.coverage).to.equal(1);
      expect(task.history).to.have.length.greaterThan(0);
      expect(task.triangulation.perspectives).to.have.lengthOf(4);
    }

    expect(run.aggregate.ownerSupremacy.readiness).to.equal("ready");
    expect(run.aggregate.ownerSupremacy.coverageRatio).to.equal(1);
    expect(run.aggregate.ownerSupremacy.declaredScripts).to.be.greaterThan(0);
    expect(run.aggregate.ownerSupremacy.availableScripts).to.equal(0);
    expect(run.aggregate.ownerSupremacy.scriptAvailability).to.equal(0);
    expect(run.aggregate.ownerSupremacy.capabilityDeclarations).to.be.greaterThan(0);
    expect(run.aggregate.ownerSupremacy.commandDeclared).to.equal(
      run.aggregate.ownerSupremacy.capabilityDeclarations,
    );
    expect(run.aggregate.ownerSupremacy.commandAvailable).to.equal(0);
    expect(run.aggregate.ownerSupremacy.commandAvailability).to.equal(0);
    expect(run.aggregate.ownerSupremacy.verificationDeclared).to.equal(
      run.aggregate.ownerSupremacy.capabilityDeclarations,
    );
    expect(run.aggregate.ownerSupremacy.verificationAvailable).to.equal(0);
    expect(run.aggregate.ownerSupremacy.verificationAvailability).to.equal(0);
    expect(run.ownerCapabilitiesAudit).to.be.an("array").that.is.empty;

    const rerun = runMetaSynthesis(mission, coverage);
    expect(rerun.aggregate.globalBestScore).to.be.closeTo(run.aggregate.globalBestScore, 1e-9);
    expect(rerun.aggregate.energyUsage).to.equal(run.aggregate.energyUsage);
    expect(rerun.aggregate.noveltyScore).to.be.closeTo(run.aggregate.noveltyScore, 1e-12);

    for (const task of rerun.tasks) {
      const baseline = baselineById.get(task.task.id);
      expect(baseline, `missing baseline for ${task.task.id}`).to.not.equal(undefined);
      if (!baseline) {
        continue;
      }
      expect(task.bestCandidate.metrics.score).to.equal(baseline.bestCandidate.metrics.score);
      expect(task.bestCandidate.metrics.energy).to.equal(baseline.bestCandidate.metrics.energy);
      expect(task.bestCandidate.metrics.novelty).to.equal(baseline.bestCandidate.metrics.novelty);
      expect(task.bestCandidate.metrics.operationsUsed).to.equal(
        baseline.bestCandidate.metrics.operationsUsed,
      );
      const baselineSignature = baseline.bestCandidate.operations.map(signature);
      const rerunSignature = task.bestCandidate.operations.map(signature);
      expect(rerunSignature).to.deep.equal(baselineSignature);
    }
  });

  it("keeps thermodynamic sentinels and archives within alignment", function () {
    expect(run.aggregate.thermodynamics.statusCounts.drift).to.equal(0);
    for (const task of run.tasks) {
      expect(task.thermodynamics.status).to.equal("aligned");
      expect(task.thermodynamics.delta).to.be.at.most(task.thermodynamics.tolerance);
      expect(task.archive.length).to.be.greaterThan(0);
      expect(task.triangulation.passed).to.be.at.least(1);
      expect(task.triangulation.confidence).to.be.at.least(0.3);
    }
  });

  it("updates owner supremacy ratios after report generation", async function () {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-agentic-synthesis-"));
    try {
      const runWithReports = await executeSynthesis({
        missionFile: missionPath,
        reportDir: tempDir,
        reportFile: path.join(tempDir, "report.md"),
        summaryFile: path.join(tempDir, "summary.json"),
        dashboardFile: path.join(tempDir, "dashboard.html"),
        manifestFile: path.join(tempDir, "manifest.json"),
        triangulationFile: path.join(tempDir, "triangulation.json"),
        briefingFile: path.join(tempDir, "briefing.md"),
      });

      expect(runWithReports.ownerScriptsAudit).to.have.length.greaterThan(0);
      expect(runWithReports.aggregate.ownerSupremacy.availableScripts).to.equal(
        runWithReports.aggregate.ownerSupremacy.declaredScripts,
      );
      expect(runWithReports.aggregate.ownerSupremacy.scriptAvailability).to.equal(1);
      expect(runWithReports.aggregate.ownerSupremacy.readiness).to.equal("ready");
      expect(runWithReports.aggregate.ownerSupremacy.commandAvailability).to.equal(1);
      expect(runWithReports.aggregate.ownerSupremacy.verificationAvailability).to.equal(1);
      expect(runWithReports.ownerCapabilitiesAudit.every((entry) => entry.commandAvailable)).to.equal(true);
      expect(runWithReports.ownerCapabilitiesAudit.every((entry) => entry.verificationAvailable)).to.equal(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
