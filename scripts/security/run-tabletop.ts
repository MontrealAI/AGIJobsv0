import { promises as fs } from 'fs';
import path from 'path';

import { z } from 'zod';

type OutputFormat = 'markdown' | 'human' | 'json';

interface CliOptions {
  scenarioIds: string[];
  format: OutputFormat;
  catalogPath?: string;
  outPath?: string;
  listOnly: boolean;
  help: boolean;
}

interface RenderContext {
  generatedAt: string;
  catalogVersion?: string;
  catalogLastUpdated?: string;
}

const StepSchema = z.object({
  title: z.string().min(1, 'Step title is required'),
  owner: z.string().min(1, 'Step owner is required'),
  actions: z.array(z.string().min(1)).min(1, 'Each step must contain at least one action'),
  evidence: z.array(z.string().min(1)).default([]),
  communications: z.array(z.string().min(1)).default([]),
  durationMinutes: z.number().int().nonnegative().optional(),
});

type ScenarioStep = z.infer<typeof StepSchema>;

const MetricsSchema = z
  .object({
    detectionSloMinutes: z.number().int().nonnegative().optional(),
    responseSloMinutes: z.number().int().nonnegative().optional(),
    restorationSloMinutes: z.number().int().nonnegative().optional(),
    notes: z.array(z.string().min(1)).default([]),
  })
  .default({ notes: [] });

const ScenarioSchema = z.object({
  id: z.string().min(1, 'Scenario id is required'),
  title: z.string().min(1, 'Scenario title is required'),
  severity: z.enum(['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4']),
  description: z.string().min(1),
  triggers: z.array(z.string().min(1)).min(1),
  objectives: z.array(z.string().min(1)).min(1),
  steps: z.array(StepSchema).min(1, 'Scenario must define at least one step'),
  metrics: MetricsSchema,
  evidence: z.array(z.string().min(1)).default([]),
  tabletopFocus: z.array(z.string().min(1)).default([]),
  communicationsPlan: z.array(z.string().min(1)).default([]),
  dependencies: z.array(z.string().min(1)).default([]),
  postExerciseQuestions: z.array(z.string().min(1)).default([]),
});

type Scenario = z.infer<typeof ScenarioSchema>;

const CatalogSchema = z.object({
  version: z.string().optional(),
  lastUpdated: z.string().optional(),
  scenarios: z.array(ScenarioSchema).min(1, 'At least one scenario must be defined'),
});

type Catalog = z.infer<typeof CatalogSchema>;

const DEFAULT_CATALOG_PATH = path.resolve(process.cwd(), 'docs', 'security', 'incident-response-scenarios.json');

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    scenarioIds: [],
    format: 'markdown',
    listOnly: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if ((current === '--scenario' || current === '-s') && argv[i + 1]) {
      options.scenarioIds.push(argv[i + 1]);
      i += 1;
    } else if (current === '--format' && argv[i + 1]) {
      const candidate = argv[i + 1];
      if (candidate === 'markdown' || candidate === 'human' || candidate === 'json') {
        options.format = candidate;
      } else {
        throw new Error(`Unsupported format "${candidate}". Use markdown|human|json.`);
      }
      i += 1;
    } else if (current === '--catalog' && argv[i + 1]) {
      options.catalogPath = argv[i + 1];
      i += 1;
    } else if (current === '--out' && argv[i + 1]) {
      options.outPath = argv[i + 1];
      i += 1;
    } else if (current === '--list') {
      options.listOnly = true;
    } else if (current === '--help' || current === '-h') {
      options.help = true;
    } else if (current === '--all') {
      options.scenarioIds = [];
    }
  }

  return options;
}

function usage(): string {
  return `Usage: ts-node scripts/security/run-tabletop.ts [options]\n\n` +
    'Options:\n' +
    '  --scenario <id>   Generate output for a specific scenario (repeatable).\n' +
    '  --all             Include every scenario in the catalog (default behaviour).\n' +
    '  --format <type>   Output format: markdown (default), human, json.\n' +
    '  --catalog <path>  Path to scenario catalog JSON (default docs/security/incident-response-scenarios.json).\n' +
    '  --out <path>      Write output to file (directories will be created).\n' +
    '  --list            List available scenarios and exit.\n' +
    '  --help            Show this message.\n';
}

async function loadCatalog(catalogPath?: string): Promise<{ catalog: Catalog; filePath: string }> {
  const resolvedPath = path.resolve(process.cwd(), catalogPath ?? DEFAULT_CATALOG_PATH);
  const buffer = await fs.readFile(resolvedPath, 'utf8');
  const parsedJson = JSON.parse(buffer);
  const catalog = CatalogSchema.parse(parsedJson);
  return { catalog, filePath: resolvedPath };
}

function selectScenarios(catalog: Catalog, scenarioIds: string[]): { selected: Scenario[]; missing: string[] } {
  if (scenarioIds.length === 0) {
    return { selected: catalog.scenarios, missing: [] };
  }

  const idSet = new Set(scenarioIds);
  const selected = catalog.scenarios.filter((scenario) => idSet.has(scenario.id));
  const missing = scenarioIds.filter((id) => !selected.some((scenario) => scenario.id === id));
  return { selected, missing };
}

function renderMarkdown(context: RenderContext, scenarios: Scenario[]): string {
  const lines: string[] = [];
  lines.push('# Incident Tabletop Exercise Plan');
  lines.push('');
  lines.push(`Generated: ${context.generatedAt}`);
  if (context.catalogVersion) {
    lines.push(`Catalog version: ${context.catalogVersion}`);
  }
  if (context.catalogLastUpdated) {
    lines.push(`Catalog last updated: ${context.catalogLastUpdated}`);
  }
  lines.push('');

  scenarios.forEach((scenario, index) => {
    lines.push(`## Scenario: ${scenario.title}`);
    lines.push('');
    lines.push(`- **ID:** ${scenario.id}`);
    lines.push(`- **Severity:** ${scenario.severity}`);
    lines.push(`- **Purpose:** ${scenario.description}`);
    if (scenario.tabletopFocus.length > 0) {
      lines.push(`- **Focus areas:** ${scenario.tabletopFocus.join('; ')}`);
    }
    if (scenario.dependencies.length > 0) {
      lines.push(`- **Dependencies:** ${scenario.dependencies.join('; ')}`);
    }
    lines.push('');

    lines.push('### Activation triggers');
    scenario.triggers.forEach((trigger) => {
      lines.push(`- ${trigger}`);
    });
    lines.push('');

    lines.push('### Objectives');
    scenario.objectives.forEach((objective) => {
      lines.push(`- ${objective}`);
    });
    lines.push('');

    if (scenario.communicationsPlan.length > 0) {
      lines.push('### Communications plan');
      scenario.communicationsPlan.forEach((entry) => {
        lines.push(`- ${entry}`);
      });
      lines.push('');
    }

    lines.push('### Step-by-step flow');
    scenario.steps.forEach((step, stepIndex) => {
      lines.push(`#### Step ${stepIndex + 1}: ${step.title}`);
      lines.push(`*Owner:* ${step.owner}`);
      if (typeof step.durationMinutes === 'number') {
        lines.push(`*Target duration:* ${step.durationMinutes} minutes`);
      }
      lines.push('**Actions**');
      step.actions.forEach((action) => {
        lines.push(`- ${action}`);
      });
      if (step.evidence.length > 0) {
        lines.push('**Evidence**');
        step.evidence.forEach((evidence) => {
          lines.push(`- ${evidence}`);
        });
      }
      if (step.communications.length > 0) {
        lines.push('**Communications**');
        step.communications.forEach((communication) => {
          lines.push(`- ${communication}`);
        });
      }
      lines.push('');
    });

    if (scenario.metrics.detectionSloMinutes || scenario.metrics.responseSloMinutes || scenario.metrics.restorationSloMinutes) {
      lines.push('### Service level objectives');
      if (typeof scenario.metrics.detectionSloMinutes === 'number') {
        lines.push(`- Detection SLO: ${scenario.metrics.detectionSloMinutes} minutes`);
      }
      if (typeof scenario.metrics.responseSloMinutes === 'number') {
        lines.push(`- Response SLO: ${scenario.metrics.responseSloMinutes} minutes`);
      }
      if (typeof scenario.metrics.restorationSloMinutes === 'number') {
        lines.push(`- Restoration SLO: ${scenario.metrics.restorationSloMinutes} minutes`);
      }
      scenario.metrics.notes.forEach((note) => {
        lines.push(`- Note: ${note}`);
      });
      lines.push('');
    }

    if (scenario.evidence.length > 0) {
      lines.push('### Artefacts to capture');
      scenario.evidence.forEach((entry) => {
        lines.push(`- ${entry}`);
      });
      lines.push('');
    }

    if (scenario.postExerciseQuestions.length > 0) {
      lines.push('### Post-exercise reflection');
      scenario.postExerciseQuestions.forEach((question) => {
        lines.push(`- ${question}`);
      });
      lines.push('');
    }

    if (index < scenarios.length - 1) {
      lines.push('---');
      lines.push('');
    }
  });

  return lines.join('\n');
}

function renderHuman(context: RenderContext, scenarios: Scenario[]): string {
  const sections: string[] = [];
  sections.push(`Incident Tabletop Exercise Plan (generated ${context.generatedAt})`);
  if (context.catalogVersion) {
    sections.push(`Catalog version ${context.catalogVersion}`);
  }
  if (context.catalogLastUpdated) {
    sections.push(`Catalog last updated ${context.catalogLastUpdated}`);
  }
  sections.push('');

  scenarios.forEach((scenario, index) => {
    sections.push(`${index + 1}. ${scenario.title} [${scenario.id} – ${scenario.severity}]`);
    sections.push(`Purpose: ${scenario.description}`);
    if (scenario.tabletopFocus.length > 0) {
      sections.push(`Focus areas: ${scenario.tabletopFocus.join('; ')}`);
    }
    if (scenario.dependencies.length > 0) {
      sections.push(`Dependencies: ${scenario.dependencies.join('; ')}`);
    }
    sections.push('Triggers:');
    scenario.triggers.forEach((trigger, triggerIndex) => {
      sections.push(`  ${triggerIndex + 1}) ${trigger}`);
    });
    sections.push('Objectives:');
    scenario.objectives.forEach((objective, objectiveIndex) => {
      sections.push(`  ${objectiveIndex + 1}) ${objective}`);
    });
    if (scenario.communicationsPlan.length > 0) {
      sections.push('Communications:');
      scenario.communicationsPlan.forEach((entry, commIndex) => {
        sections.push(`  ${commIndex + 1}) ${entry}`);
      });
    }
    sections.push('Steps:');
    scenario.steps.forEach((step, stepIndex) => {
      const duration = typeof step.durationMinutes === 'number' ? ` (~${step.durationMinutes}m)` : '';
      sections.push(`  ${stepIndex + 1}. ${step.title}${duration} — Owner: ${step.owner}`);
      step.actions.forEach((action, actionIndex) => {
        sections.push(`     - Action ${actionIndex + 1}: ${action}`);
      });
      if (step.evidence.length > 0) {
        step.evidence.forEach((evidence) => {
          sections.push(`     - Evidence: ${evidence}`);
        });
      }
      if (step.communications.length > 0) {
        step.communications.forEach((communication) => {
          sections.push(`     - Comms: ${communication}`);
        });
      }
    });
    const sloParts: string[] = [];
    if (typeof scenario.metrics.detectionSloMinutes === 'number') {
      sloParts.push(`detection ${scenario.metrics.detectionSloMinutes}m`);
    }
    if (typeof scenario.metrics.responseSloMinutes === 'number') {
      sloParts.push(`response ${scenario.metrics.responseSloMinutes}m`);
    }
    if (typeof scenario.metrics.restorationSloMinutes === 'number') {
      sloParts.push(`restoration ${scenario.metrics.restorationSloMinutes}m`);
    }
    if (sloParts.length > 0 || scenario.metrics.notes.length > 0) {
      sections.push(`SLOs: ${sloParts.join(', ') || 'n/a'}`);
      scenario.metrics.notes.forEach((note) => {
        sections.push(`  - Note: ${note}`);
      });
    }
    if (scenario.evidence.length > 0) {
      sections.push('Capture the following artefacts:');
      scenario.evidence.forEach((entry) => {
        sections.push(`  - ${entry}`);
      });
    }
    if (scenario.postExerciseQuestions.length > 0) {
      sections.push('Reflection prompts:');
      scenario.postExerciseQuestions.forEach((question) => {
        sections.push(`  - ${question}`);
      });
    }
    sections.push('');
  });

  return sections.join('\n');
}

function renderJson(context: RenderContext, scenarios: Scenario[]): string {
  const payload = {
    generatedAt: context.generatedAt,
    catalogVersion: context.catalogVersion ?? null,
    catalogLastUpdated: context.catalogLastUpdated ?? null,
    scenarios,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function writeOutput(content: string, outPath?: string): Promise<void> {
  if (!outPath) {
    process.stdout.write(content);
    if (!content.endsWith('\n')) {
      process.stdout.write('\n');
    }
    return;
  }

  const resolved = path.resolve(process.cwd(), outPath);
  const directory = path.dirname(resolved);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(resolved, content, 'utf8');
  process.stderr.write(`✅ Wrote tabletop plan to ${resolved}\n`);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      await writeOutput(`${usage()}\n`);
      return;
    }

    const { catalog, filePath } = await loadCatalog(options.catalogPath);
    const context: RenderContext = {
      generatedAt: new Date().toISOString(),
      catalogVersion: catalog.version,
      catalogLastUpdated: catalog.lastUpdated,
    };

    if (options.listOnly) {
      const lines = catalog.scenarios.map((scenario) => `${scenario.id}\t${scenario.title} (${scenario.severity})`);
      await writeOutput(`${lines.join('\n')}\n`);
      return;
    }

    const { selected, missing } = selectScenarios(catalog, options.scenarioIds);

    if (missing.length > 0) {
      throw new Error(`Unknown scenario id(s): ${missing.join(', ')}`);
    }

    if (selected.length === 0) {
      throw new Error('No scenarios selected. Use --scenario <id> or ensure catalog defines scenarios.');
    }

    const relativeCatalog = path.relative(process.cwd(), filePath);
    context.catalogVersion = context.catalogVersion ?? `@${relativeCatalog}`;

    let output = '';
    if (options.format === 'json') {
      output = renderJson(context, selected);
    } else if (options.format === 'human') {
      output = `${renderHuman(context, selected)}\n`;
    } else {
      output = `${renderMarkdown(context, selected)}\n`;
    }

    await writeOutput(output, options.outPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`❌ ${message}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  }
}

void main();
