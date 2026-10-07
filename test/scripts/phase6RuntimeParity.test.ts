import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parsePhase6Json,
  validatePhase6Config,
} from '../../scripts/phase6/config-validation';

type JsonObject = Record<string, any>;
type Candidate = { name: string; source: string };
const clone = (value: JsonObject): JsonObject =>
  JSON.parse(JSON.stringify(value));

// Retain one representative entry per list so the corpus stays small while using
// the actual distributed configuration and all its declared object shapes.
function representative(value: any): any {
  if (Array.isArray(value)) return value.slice(0, 1).map(representative);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, representative(item)])
    );
  return value;
}

function parentAt(value: JsonObject, path: Array<string | number>): any {
  return path.reduce((current, key) => current[key], value);
}

function corpus(): { candidates: Candidate[]; required: Set<string> } {
  const config = representative(
    JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json'
        ),
        'utf8'
      )
    )
  );
  config.domains[0].sunsetPlan = {
    reason: 'Retirement rehearsal',
    retirementBlock: 100,
    handoffDomains: ['health'],
    notes: 'Planning only',
  };
  const candidates: Candidate[] = [];
  const required = new Set<string>();
  const add = (name: string, value: JsonObject, mustAccept = false) => {
    candidates.push({ name, source: JSON.stringify(value) });
    if (mustAccept) required.add(name);
  };
  add('distributed configuration, representative entries', config, true);
  add(
    'minimal declared domain',
    {
      global: { manifestURI: 'ipfs://global' },
      domains: [
        {
          slug: 'finance',
          name: 'Finance',
          manifestURI: 'ipfs://finance',
          subgraph: 'https://example.test',
          validationModule: config.domains[0].validationModule,
        },
      ],
    },
    true
  );
  for (const lifecycle of ['active', 'experimental', 'sunset']) {
    const variant = clone(config);
    variant.domains[0].lifecycle = lifecycle;
    add(`lifecycle ${lifecycle}`, variant, true);
  }
  const providers = clone(config);
  providers.global.decentralizedInfra[0].provider = 'Example global provider';
  providers.domains[0].infrastructure[0].provider = 'Example domain provider';
  add('declared infrastructure providers', providers, true);
  const metadata = clone(config);
  metadata.domains[0].metadata.sentinel = null;
  metadata.domains[0].metadata.uptime = '';
  metadata.domains[0].metadata.valueFlowDisplay = 'Illustrative';
  metadata.domains[0].metadata.operatorNotes = { department: 'finance' };
  add('optional metadata with an extension', metadata, true);
  const globalWithoutLayer = clone(config);
  delete globalWithoutLayer.global.decentralizedInfra[0].layer;
  add('global infrastructure without a domain layer', globalWithoutLayer, true);

  // Deleting any one declared field exercises optional-field interactions. A
  // required-field deletion is excluded only if the real TypeScript validator
  // rejects it; every accepted variant must survive the actual Python loader.
  const walk = (value: any, path: Array<string | number> = []) => {
    if (Array.isArray(value)) {
      if (value.length && value[0] && typeof value[0] === 'object')
        walk(value[0], [...path, 0]);
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        const variant = clone(config);
        delete parentAt(variant, path)[key];
        add(`omit ${[...path, key].join('.')}`, variant);
        walk(item, [...path, key]);
      }
      const variant = clone(config);
      parentAt(variant, path).unrecognizedField = true;
      add(`unknown field in ${path.join('.') || 'root'}`, variant);
    }
  };
  walk(config);
  const typePaths: Array<Array<string | number>> = [
    ['scenario'],
    ['global', 'credentials'],
    ['domains', 0, 'active'],
    ['domains', 0, 'lifecycle'],
    ['domains', 0, 'metadata', 'sentinel'],
    ['domains', 0, 'metadata', 'uptime'],
    ['domains', 0, 'metadata', 'valueFlowDisplay'],
    ['domains', 0, 'infrastructure', 0, 'layer'],
    ['domains', 0, 'infrastructure', 0, 'provider'],
    ['global', 'decentralizedInfra', 0, 'provider'],
    ['domains', 0, 'credentials', 0, 'issuers'],
    ['domains', 0, 'sunsetPlan', 'retirementBlock'],
  ];
  for (const path of typePaths) {
    for (const value of [null, '', 0, 1, 1.5, true, [], {}, 'Example']) {
      const variant = clone(config);
      parentAt(variant, path.slice(0, -1))[path[path.length - 1]] = value;
      add(`type ${path.join('.')} = ${JSON.stringify(value)}`, variant);
    }
  }
  // Preserve JSON numeric syntax: JSON.stringify alone would turn 30.0 into 30,
  // concealing the JS-number/Python-float compatibility boundary.
  for (const [field, value, literal] of [
    ['heartbeatSeconds', 30, '30.0'],
    ['l2SyncCadence', 30, '3e1'],
    ['treasuryBufferBps', 1, '1.0'],
    ['minStake', 100, '1e2'],
  ] as const) {
    const variant = clone(config);
    const target =
      field === 'heartbeatSeconds'
        ? variant.domains[0]
        : field === 'l2SyncCadence'
        ? variant.global
        : field === 'treasuryBufferBps'
        ? variant.global.guards
        : variant.domains[0].operations;
    target[field] = value;
    const name = `raw JSON ${field} ${literal}`;
    candidates.push({
      name,
      source: JSON.stringify(variant).replace(
        `"${field}":${value}`,
        `"${field}":${literal}`
      ),
    });
    required.add(name);
  }
  return { candidates, required };
}

const PYTHON_LOADER = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("phase6_runtime_parity", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
cases = json.loads(sys.stdin.read())
failures = []
for case in cases:
    try:
        payload = json.loads(case["source"], object_pairs_hook=module._unique_object, parse_constant=module._reject_constant)
        module.DomainExpansionRuntime.from_payload(payload)
    except Exception as error:
        failures.append({"case": case["name"], "error": str(error)})
print(json.dumps({"checked": len(cases), "failures": failures}))
`;

describe('Phase 6 TypeScript/Python configuration compatibility', function () {
  it('loads each accepted representative configuration through the actual Python runtime', function () {
    const { candidates, required } = corpus();
    expect(candidates.length).to.be.lessThan(350);
    const accepted = candidates.filter((candidate) => {
      try {
        validatePhase6Config(parsePhase6Json(candidate.source));
        return true;
      } catch (error) {
        if (required.has(candidate.name))
          throw new Error(`${candidate.name}: ${String(error)}`);
        return false;
      }
    });
    expect(accepted.length).to.be.greaterThan(required.size);
    const result = spawnSync(
      'python3',
      [
        '-c',
        PYTHON_LOADER,
        resolve(__dirname, '../../orchestrator/extensions/phase6.py'),
      ],
      {
        input: JSON.stringify(accepted),
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
      }
    );
    if (result.error) throw result.error;
    expect(result.status, result.stderr || result.stdout).to.equal(0);
    const report = JSON.parse(result.stdout);
    expect(report.checked).to.equal(accepted.length);
    expect(
      report.failures,
      JSON.stringify(report.failures, null, 2)
    ).to.deep.equal([]);
  });
});
