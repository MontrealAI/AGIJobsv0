import fs from 'node:fs/promises';
import path from 'node:path';
import { DemoResult, RunResult } from './types';

export interface ReportPaths {
  outputDir: string;
  uiDataPath?: string;
}

export async function writeReports(result: DemoResult, paths: ReportPaths): Promise<void> {
  await fs.mkdir(paths.outputDir, { recursive: true });
  const summaryPath = path.join(paths.outputDir, 'summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(result, null, 2));

  const flowPath = path.join(paths.outputDir, 'experience-flow.mmd');
  await fs.writeFile(flowPath, renderFlowDiagram(result));

  const timelinePath = path.join(paths.outputDir, 'value-cadence.mmd');
  await fs.writeFile(timelinePath, renderTimelineDiagram());

  const controlPath = path.join(paths.outputDir, 'owner-control.json');
  await fs.writeFile(controlPath, JSON.stringify(renderOwnerControl(result.learning), null, 2));

  const controlMermaid = path.join(paths.outputDir, 'owner-control.mmd');
  await fs.writeFile(controlMermaid, renderOwnerControlMermaid(result));

  const supremacyPath = path.join(paths.outputDir, 'supremacy-ledger.json');
  await fs.writeFile(supremacyPath, JSON.stringify(renderSupremacyLedger(result), null, 2));

  if (paths.uiDataPath) {
    await fs.mkdir(path.dirname(paths.uiDataPath), { recursive: true });
    await fs.writeFile(paths.uiDataPath, JSON.stringify(result, null, 2));
  }
}

function renderFlowDiagram(result: DemoResult): string {
  const baseline = result.baseline.metrics;
  const learning = result.learning.metrics;
  return `%% Experience-native AGI Jobs execution lattice
flowchart TD
  User[Human Operator] -->|Prompt & Objectives| MissionConsole
  MissionConsole[Mission Console] -->|Scenario Selection| ExperiencePlanner
  ExperiencePlanner -->|Streamed Jobs (${result.scenario.jobs.count})| Orchestrator
  Orchestrator -->|Baseline Heuristic| BaselineLoop[Baseline Loop GMV ${baseline.gmv.toFixed(0)}]
  Orchestrator -->|Learning Policy| LearningLoop[Era Policy GMV ${learning.gmv.toFixed(0)}]
  LearningLoop -->|Continuous Rewards| RewardEngine
  RewardEngine[Reward Composer] --> ExperienceBuffer
  ExperienceBuffer[(Streaming Buffer)] --> Trainer
  Trainer[Real-time Policy Trainer] -->|Updated Weights| Orchestrator
  Trainer -->|Policy Snapshots| OwnerMultisig[Owner Multi-sig]
  OwnerMultisig -->|Pause/Upgrade Commands| Orchestrator
  MissionConsole -->|Mermaid Dashboards| OperatorIntelligence[Operator Intelligence Center]
`;
}

function renderTimelineDiagram(): string {
  return `gantt
  title Era of Experience Compounding Cycle
  dateFormat  X
  section Operator Activation
    Scenario Briefing        :done, briefing, 0, 6h
    Sovereignty Validation   :active, audit, 2, 8h
  section Learning Flywheel
    Job Stream Ingestion     :active, ingestion, 4, 48h
    Policy Refinement Pulses :crit, pulses, 8, 48h
    Reward Composer Tuning   :active, rewards, 8, 36h
  section Owner Control
    Multisig Checkpoints     :milestone, owner, 16, 12h
    Upgrade Capsule Prep     :after owner, 12h
`;
}

function renderOwnerControl(run: RunResult) {
  return {
    timestamp: new Date().toISOString(),
    controlSurfaces: [
      {
        surface: 'explorationRate',
        description: 'Adjust exploration epsilon live without redeploying.',
        command: 'npm run owner:era-of-experience:controls -- --exploration 0.08',
        current: 0.12,
        recommended: Math.max(0.04, 0.12 - run.metrics.learningSignalDensity * 0.05)
      },
      {
        surface: 'policyCheckpoint',
        description: 'Promote the latest high-performing policy snapshot.',
        command: 'npm run owner:era-of-experience:controls -- --promote-latest',
        current: 'latest',
        recommended: 'Promote if GMV delta > 8%'
      },
      {
        surface: 'rewardWeights',
        description: 'Retune reward weights to emphasise GMV or latency.',
        command: 'npm run owner:era-of-experience:controls -- --reward gmvsurge.json',
        current: 'reward-default.json',
        recommended: 'Increase valueWeight if enterprise GMV > 55% of total'
      }
    ],
    metrics: run.metrics
  };
}

function renderOwnerControlMermaid(result: DemoResult): string {
  return `graph TD
  Owner[Owner Multi-Sig] -->|Toggles Exploration| PolicySwitch
  Owner -->|Approves Reward Shifts| RewardDeck
  Owner -->|Applies Circuit Breakers| SentinelGrid
  PolicySwitch[Exploration Switch] --> Orchestrator
  RewardDeck[Reward Composer Deck] --> RewardEngine
  SentinelGrid[Sentinel Alerts] --> MissionConsole
  MissionConsole[Mission Console] -->|Publishes KPIs| OperatorIntel
  OperatorIntel -->|Confirms Lift ${result.delta.gmvDelta?.toFixed(2) ?? '0.00'}x| Owner
`;
}

function renderSupremacyLedger(result: DemoResult) {
  const gmvLift = safeDelta(result.baseline.metrics.gmv, result.learning.metrics.gmv);
  const roiLift = safeDelta(result.baseline.metrics.roi, result.learning.metrics.roi);
  const autonomyLift = safeDelta(result.baseline.metrics.autonomyLift, result.learning.metrics.autonomyLift);
  return {
    timestamp: new Date().toISOString(),
    supremacyIndex: Number((0.45 * gmvLift + 0.3 * roiLift + 0.25 * autonomyLift).toFixed(4)),
    deltas: {
      gmv: gmvLift,
      roi: roiLift,
      autonomy: autonomyLift
    },
    assurances: {
      pauseReady: true,
      checkpointDepth: 4,
      monitoring: ['performance-drop', 'latency-spike', 'gmv-regression']
    },
    interpretation:
      'The learning policy materially expands GMV, ROI, and autonomy simultaneously while preserving owner-first guardrails.'
  };
}

function safeDelta(base: number, next: number): number {
  if (base === 0) {
    return next === 0 ? 0 : next;
  }
  return Number(((next - base) / base).toFixed(6));
}
