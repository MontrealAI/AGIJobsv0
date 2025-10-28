import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadScenarioFromFile } from '../runDemo';

type Scenario = Awaited<ReturnType<typeof loadScenarioFromFile>>;

type SurfaceType = 'job' | 'validator' | 'adapter' | 'module';

type ActionPlan = {
  commands: string[];
  description: string;
  verification?: string[];
  impact?: string;
};

type NormalisedControl = { action: string; script: string; description: string };
type RawControl = { action?: string; script?: string; description?: string };

type SurfaceCommand = {
  id: string;
  name: string;
  type: SurfaceType;
  controls: NormalisedControl[];
};

function normaliseControls(controls: RawControl[]): NormalisedControl[] {
  return controls.map((control) => {
    if (!control.action || !control.script || !control.description) {
      throw new Error(`Control entry missing fields: ${JSON.stringify(control)}`);
    }
    return {
      action: control.action,
      script: control.script,
      description: control.description,
    };
  });
}

const actionLibrary: Record<string, ActionPlan> = {
  'job:expedite': {
    commands: [
      'npm run owner:parameters -- --profile economic-power --set jobDuration=48',
      'npm run owner:verify-control -- --surface job-registry',
    ],
    description: 'Compress maximum job duration and verify registry propagation for accelerated settlement.',
    verification: ['npm run demo:economic-power:ci'],
    impact: 'Shortens AI Lab Fusion runtime to 48h and increases capital velocity.',
  },
  'job:dispatch': {
    commands: [
      'npm run owner:surface -- --assign helios.agent.agijobs.eth --job job-ai-lab-fusion',
      'npm run owner:pulse',
    ],
    description: 'Assign Helios Sovereign Build Hub as the executor and broadcast orchestration pulse updates.',
    verification: ['npm run owner:snapshot'],
    impact: 'Guarantees Helios receives dispatch and telemetry snapshots refresh instantly.',
  },
  'job:escalate': {
    commands: [
      'npm run owner:upgrade -- --module validation-module --target-quorum 5',
      'npm run owner:verify-control -- --surface validation-module',
    ],
    description: 'Raise validator quorum for the accelerator deliverables and confirm commit–reveal parameters.',
    verification: ['npm run owner:plan'],
    impact: 'Increases validator confidence floor above 99% for the accelerator job.',
  },
  'job:synchronize': {
    commands: [
      'npm run owner:parameters -- --profile economic-power --set supplyMesh.window=24h',
      'npm run owner:surface -- --emit atlas-schedule --job job-supply-chain',
    ],
    description: 'Re-sequence the autonomous supply mesh window and rebroadcast Atlas schedules.',
    verification: ['npm run demo:economic-power:ci'],
    impact: 'Aligns supply mesh dependencies and prevents backlog accumulation.',
  },
  'job:reassign': {
    commands: [
      'npm run owner:surface -- --reassign atlas.agent.agijobs.eth --job job-supply-chain',
      'npm run owner:pulse',
    ],
    description: 'Reassign the supply mesh job to Atlas Strategic Model Forge with enforced throughput targets.',
    verification: ['npm run owner:surface -- --report atlas'],
    impact: 'Maintains throughput above 30 jobs/day across supply mesh workloads.',
  },
  'job:ratify': {
    commands: [
      'npm run owner:plan',
      'npm run owner:update-all -- --module validation-module',
    ],
    description: 'Execute the governance upgrade playbook with deterministic multi-sig confirmations.',
    verification: ['npm run owner:plan:safe'],
    impact: 'Activates upgraded consensus parameters with full governance ledger trace.',
  },
  'job:audit': {
    commands: [
      'npm run owner:audit',
      'npm run owner:snapshot',
    ],
    description: 'Trigger Sentinel Assurance Fabric attestation sweep for governance upgrade launch.',
    verification: ['npm run owner:verify-control -- --surface governance'],
    impact: 'Produces audit artefacts for compliance partners within five minutes.',
  },
  'job:amplify': {
    commands: [
      'npm run owner:parameters -- --profile economic-power --set marketing.budgetMultiplier=1.35',
      'npm run owner:surface -- --emit aurora-expansion',
    ],
    description: 'Scale omniloop marketing spend and broadcast expansion signals to Aurora.',
    verification: ['npm run owner:pulse'],
    impact: 'Expands market omniloop reach while keeping validator capacity aligned.',
  },
  'job:throttle': {
    commands: [
      'npm run owner:parameters -- --profile economic-power --set marketing.budgetMultiplier=0.8',
      'npm run owner:pulse',
    ],
    description: 'Throttle expansion to preserve validator bandwidth during defensive postures.',
    verification: ['npm run demo:economic-power:ci'],
    impact: 'Reduces load by 20% while maintaining profitability.',
  },
  'job:harden': {
    commands: [
      'npm run owner:update-all -- --module oracle-adapter',
      'npm run owner:surface -- --emit helios-oracle-hardening',
    ],
    description: 'Roll out upgraded oracle attestations and enable fallback feeds.',
    verification: ['npm run owner:verify-control -- --surface oracle-adapter'],
    impact: 'Increases oracle resilience with dual-feed redundancy.',
  },
  'job:failover': {
    commands: [
      'npm run owner:surface -- --failover helios-backup --job job-oracle-integration',
      'npm run owner:pulse',
    ],
    description: 'Shift execution to Helios backup endpoints with synchronized credentials.',
    verification: ['npm run owner:surface -- --report helios'],
    impact: 'Maintains oracle uptime during regional outages.',
  },
  'validator:rotate': {
    commands: [
      'npm run owner:rotate -- --validator {id}',
      'npm run owner:verify-control -- --surface validation-module',
    ],
    description: 'Rotate validator committee membership and ensure new roster is registered.',
    verification: ['npm run owner:snapshot'],
    impact: 'Refreshes validator pool and mitigates correlated risk.',
  },
  'validator:top-up': {
    commands: [
      'npm run owner:parameters -- --profile economic-power --set stake.{id}=+5000',
      'npm run owner:pulse',
    ],
    description: 'Increase validator stake allocation to reinforce incentives.',
    verification: ['npm run owner:verify-control -- --surface stake-manager'],
    impact: 'Boosts validator reliability score by 2%.',
  },
  'validator:slash': {
    commands: [
      'npm run owner:parameters -- --profile economic-power --slash {id}=2500',
      'npm run owner:pulse',
    ],
    description: 'Slash misbehaving validator stake and recycle capital to treasury.',
    verification: ['npm run owner:surface -- --report stake'],
    impact: 'Enforces validator accountability with immediate capital claw-back.',
  },
  'validator:policy-brief': {
    commands: [
      'npm run owner:surface -- --emit policy-brief --validator {id}',
    ],
    description: 'Publish an updated policy brief to PolicyStudio dashboards.',
    verification: ['npm run owner:pulse'],
    impact: 'Keeps economic planning synchronized with validator intelligence.',
  },
  'validator:patch': {
    commands: [
      'npm run owner:surface -- --emit security-patch --validator {id}',
    ],
    description: 'Push adversarial defense patches across validator enclaves.',
    verification: ['npm run owner:surface -- --report security'],
    impact: 'Restores validator hardening score to 100%.',
  },
  'validator:intensify': {
    commands: [
      'npm run owner:surface -- --emit redteam-intensify --validator {id}',
    ],
    description: 'Increase adversarial inference testing depth.',
    verification: ['npm run owner:pulse'],
    impact: 'Surges red-team sampling coverage by 35%.',
  },
  'adapter:upgrade': {
    commands: [
      'npm run owner:update-all -- --module stablecoin-adapter',
      'npm run owner:verify-control -- --surface stablecoin-adapter',
    ],
    description: 'Promote the audited USDC adapter bundle with reduced slippage.',
    verification: ['npm run demo:economic-power:ci'],
    impact: 'Lowers swap fees by 20% and increases fiat on-ramp reliability.',
  },
  'adapter:rebalance': {
    commands: [
      'npm run owner:parameters -- --profile economic-power --set treasury.operationsBuffer=200000',
      'npm run owner:pulse',
    ],
    description: 'Sweep stablecoin float into the operations buffer to match demand spikes.',
    verification: ['npm run owner:snapshot'],
    impact: 'Keeps operations buffer above defensive threshold.',
  },
  'module:migrate': {
    commands: [
      'npm run owner:update-all -- --module job-registry',
      'npm run owner:verify-control -- --surface job-registry',
    ],
    description: 'Execute deterministic registry migration with downtime-free swap.',
    verification: ['npm run owner:plan'],
    impact: 'Enables upgraded job registry without halting agents.',
  },
  'module:pause-local': {
    commands: ['npm run owner:system-pause -- --module job-registry'],
    description: 'Pause only job intake while keeping settlement modules live.',
    verification: ['npm run owner:verify-control -- --surface job-registry'],
    impact: 'Protects registry without interrupting payouts.',
  },
  'module:rebalance': {
    commands: ['npm run owner:parameters -- --profile economic-power --set stake.min=15000'],
    description: 'Rebalance stake thresholds for workload parallelism.',
    verification: ['npm run owner:pulse'],
    impact: 'Increases staking resilience across agents and validators.',
  },
  'module:slash': {
    commands: ['npm run owner:parameters -- --profile economic-power --slash misbehavior'],
    description: 'Trigger stake manager slashing routine.',
    verification: ['npm run owner:snapshot'],
    impact: 'Recovers slashed stake into treasury buffers.',
  },
  'module:quorum-upgrade': {
    commands: ['npm run owner:upgrade -- --module validation-module --target-quorum 5'],
    description: 'Increase validator quorum and commit windows.',
    verification: ['npm run owner:verify-control -- --surface validation-module'],
    impact: 'Raises commit–reveal security thresholds above enterprise baseline.',
  },
  'module:reset': {
    commands: ['npm run owner:surface -- --emit validator-reset'],
    description: 'Reset commit–reveal session and rotate the validator roster.',
    verification: ['npm run owner:pulse'],
    impact: 'Clears stalled commit sessions instantly.',
  },
  'module:boost': {
    commands: ['npm run owner:surface -- --emit reputation-boost'],
    description: 'Boost reputation weighting for premium validators and agents.',
    verification: ['npm run owner:snapshot'],
    impact: 'Rewards top performers with priority placement.',
  },
  'module:purge': {
    commands: ['npm run owner:surface -- --emit reputation-purge'],
    description: 'Purge underperforming actors and refresh scoring baselines.',
    verification: ['npm run owner:pulse'],
    impact: 'Maintains elite-only access to high value jobs.',
  },
  'module:escalate': {
    commands: ['npm run owner:surface -- --emit dispute-escalate'],
    description: 'Escalate dispute to extended jury.',
    verification: ['npm run owner:surface -- --report dispute'],
    impact: 'Engages extended jury within 90 seconds.',
  },
  'module:delegate': {
    commands: ['npm run owner:surface -- --delegate dispute --council emergency'],
    description: 'Delegate dispute outcome to emergency council multi-sig.',
    verification: ['npm run owner:plan'],
    impact: 'Ensures human-in-the-loop oversight for critical disputes.',
  },
  'module:rotate-metadata': {
    commands: ['npm run owner:surface -- --emit certificate-rotate'],
    description: 'Rotate IPFS metadata anchors for issued certificates.',
    verification: ['npm run owner:snapshot'],
    impact: 'Keeps certificate integrity proofs fresh for compliance.',
  },
  'module:freeze': {
    commands: ['npm run owner:system-pause -- --module certificate-nft'],
    description: 'Freeze certificate minting during governance halt.',
    verification: ['npm run owner:verify-control -- --surface certificate-nft'],
    impact: 'Prevents issuance drift during incident response.',
  },
};

function surfaceKey(type: SurfaceType, action: string): string {
  return `${type}:${action}`;
}

function normaliseId(value: string): string {
  return value.trim();
}

function collectSurfaces(scenario: Scenario): SurfaceCommand[] {
  const surfaces: SurfaceCommand[] = [];
  for (const job of scenario.jobs) {
    surfaces.push({
      id: job.id,
      name: job.name,
      type: 'job',
      controls: normaliseControls(job.controlScripts as RawControl[]),
    });
  }
  for (const validator of scenario.validators) {
    surfaces.push({
      id: validator.id,
      name: validator.name,
      type: 'validator',
      controls: normaliseControls(validator.controlScripts as RawControl[]),
    });
  }
  for (const adapter of scenario.stablecoinAdapters) {
    surfaces.push({
      id: adapter.name.replace(/\s+/g, '-'),
      name: adapter.name,
      type: 'adapter',
      controls: normaliseControls(adapter.controlScripts as RawControl[]),
    });
  }
  for (const module of scenario.modules) {
    surfaces.push({
      id: module.id,
      name: module.name,
      type: 'module',
      controls: normaliseControls((module.controlScripts ?? []) as RawControl[]),
    });
  }
  return surfaces;
}

async function main(): Promise<void> {
  const defaultScenario = path.resolve(__dirname, '..', '..', 'scenario', 'baseline.json');

  const argv = await yargs(hideBin(process.argv))
    .scriptName('economic-power-owner')
    .option('scenario', {
      alias: 's',
      type: 'string',
      default: defaultScenario,
      describe: 'Scenario file to load',
    })
    .option('surface', {
      alias: 't',
      type: 'string',
      describe: 'Surface identifier in the form type:id (e.g. job:job-ai-lab-fusion)',
    })
    .option('action', {
      alias: 'a',
      type: 'string',
      describe: 'Action to execute for the selected surface',
    })
    .option('list', {
      alias: 'l',
      type: 'boolean',
      describe: 'List available surfaces and actions',
    })
    .option('json', {
      type: 'boolean',
      describe: 'Emit machine-readable JSON output',
    })
    .check((args) => {
      if (!args.list && (!args.surface || !args.action)) {
        throw new Error('Specify --list or both --surface and --action.');
      }
      return true;
    })
    .help()
    .parseAsync();

  const scenarioPath = path.isAbsolute(argv.scenario)
    ? argv.scenario
    : path.resolve(process.cwd(), argv.scenario);
  const scenario = await loadScenarioFromFile(scenarioPath);
  const surfaces = collectSurfaces(scenario);

  if (argv.list) {
    if (argv.json) {
      const payload = surfaces.map((surface) => ({
        surface: `${surface.type}:${surface.id}`,
        name: surface.name,
        actions: surface.controls.map((control) => control.action),
      }));
      console.log(JSON.stringify({ scenario: scenario.scenarioId, surfaces: payload }, null, 2));
      return;
    }
    console.log(`Scenario: ${scenario.title} (${scenario.scenarioId})`);
    for (const surface of surfaces) {
      const surfaceId = `${surface.type}:${surface.id}`;
      const actions = surface.controls.map((control) => control.action).join(', ');
      console.log(`- ${surfaceId.padEnd(36)} • ${surface.name} • actions: ${actions}`);
    }
    return;
  }

  const [typeRaw, idRaw] = (argv.surface as string).split(':');
  const type = typeRaw as SurfaceType;
  if (!type || !['job', 'validator', 'adapter', 'module'].includes(type)) {
    throw new Error(`Unsupported surface type: ${typeRaw}`);
  }
  const id = normaliseId(idRaw ?? '');
  const surface = surfaces.find((entry) => entry.type === type && normaliseId(entry.id) === id);
  if (!surface) {
    throw new Error(`Surface ${argv.surface} not found in scenario ${scenario.scenarioId}.`);
  }

  const control = surface.controls.find((entry) => entry.action === argv.action);
  if (!control) {
    const available = surface.controls.map((entry) => entry.action).join(', ');
    throw new Error(`Action ${argv.action} not defined for ${argv.surface}. Available: ${available}`);
  }

  const key = surfaceKey(type, argv.action as string);
  const plan = actionLibrary[key] ?? {
    commands: [control.script],
    description: control.description,
  };
  const resolvedCommands = plan.commands.map((command) =>
    command.replace('{id}', surface.id),
  );

  const result = {
    scenario: scenario.scenarioId,
    surface: {
      id: surface.id,
      name: surface.name,
      type: surface.type,
    },
    action: argv.action,
    description: plan.description ?? control.description,
    impact: plan.impact ?? control.description,
    commands: resolvedCommands,
    verification: plan.verification ?? [],
    guardrailScript: control.script,
  };

  if (argv.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Scenario: ${result.scenario}`);
  console.log(`Surface: ${result.surface.type}:${result.surface.id} • ${result.surface.name}`);
  console.log(`Action: ${result.action}`);
  console.log('Description:', result.description);
  if (plan.impact) {
    console.log('Impact:', plan.impact);
  }
  console.log('\nCommand sequence:');
  for (const command of result.commands) {
    console.log(`  • ${command}`);
  }
  if (result.verification.length > 0) {
    console.log('\nVerification:');
    for (const check of result.verification) {
      console.log(`  • ${check}`);
    }
  }
  console.log('\nGuardrail script:', result.guardrailScript);
  console.log('\nNo commands were executed. Run them manually with the owner multi-sig.');
}

main().catch((error) => {
  console.error('Owner command orchestration failed:', error);
  process.exitCode = 1;
});
