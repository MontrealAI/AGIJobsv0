import { strict as assert } from 'node:assert';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEraOfExperienceDemo } from '../scripts/runDemo';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scenarioPath = path.join(__dirname, '..', 'scenario', 'experience-stream.json');
const configPath = path.join(__dirname, '..', 'config', 'simulation-config.json');
const ownerControlsPath = path.join(__dirname, '..', 'config', 'owner-controls.json');

void test('experience-native RL delivers measurable GMV and ROI lift', async () => {
  const report = await runEraOfExperienceDemo({
    scenarioPath,
    configPath,
    ownerControlsPath,
    outputDir: path.join(__dirname, '..', 'reports', 'test-artifacts'),
  });

  assert(report.improvement.gmvDelta > 0, 'GMV delta should be positive');
  assert(report.improvement.gmvLiftPct > 0.05, 'GMV lift should exceed 5%');
  assert(report.improvement.roiDelta > 0.05, 'ROI delta should exceed 0.05');
  assert(report.rlEnhanced.successRate >= report.baseline.successRate, 'Success rate should not deteriorate');
  assert(report.improvement.avgLatencyDelta <= 0.5, 'Latency delta should remain within half an hour envelope');
  assert(report.policySnapshots.length > 0, 'Policy checkpoints should be recorded');
  assert(report.experienceLogSample.length > 0, 'Experience sample should be populated');
  assert(report.ownerConsole.recommendedActions.length >= 3, 'Owner console should produce actionable guidance');
});
