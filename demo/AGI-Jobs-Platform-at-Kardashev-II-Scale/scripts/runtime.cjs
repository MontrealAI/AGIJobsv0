const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function parseOptions(argv, extra = [], extraSwitches = []) {
  const values = new Set(['profile', 'config-root', 'output-dir', ...extra]);
  const switches = new Set([
    'check',
    'ci',
    'reflect',
    'help',
    'generate',
    ...extraSwitches,
  ]);
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!match) throw new Error(`Unexpected argument: ${argv[i]}`);
    const [, key, inline] = match;
    if (Object.hasOwn(options, key))
      throw new Error(`Duplicate option: --${key}`);
    if (values.has(key)) {
      const value = inline ?? argv[++i];
      if (!value || value.startsWith('--'))
        throw new Error(`--${key} requires a value`);
      options[key] = value;
    } else if (switches.has(key) && inline === undefined) options[key] = true;
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  return options;
}

function resolveOptions(defaultRoot, argv = process.argv.slice(2)) {
  const options = parseOptions(argv);
  if (options.help) {
    console.log(
      'Deterministic, offline Kardashev II simulation. No signing or network transactions.\n' +
        'Options: --check (read-only drift + readiness check), --reflect, --profile NAME,\n' +
        '         --config-root DIR, --output-dir DIR, --help\n' +
        'Relative paths resolve from the current working directory. Keep experiment outputs separate.'
    );
    process.exit(0);
  }
  if (options.generate)
    throw new Error('--generate is a dashboard-server option');
  const profile = options.profile ?? process.env.KARDASHEV_DEMO_PROFILE;
  const root = profile ? path.resolve(defaultRoot, profile) : defaultRoot;
  if (
    profile &&
    (!root.startsWith(defaultRoot + path.sep) || !fs.existsSync(root))
  ) {
    throw new Error(`Unknown demo profile: ${profile}`);
  }
  const configRoot = path.resolve(
    options['config-root'] ?? process.env.KARDASHEV_DEMO_ROOT ?? root
  );
  const outputDir = path.resolve(
    options['output-dir'] ?? path.join(configRoot, 'output')
  );
  const prefix =
    process.env.KARDASHEV_DEMO_PREFIX ||
    (path.basename(root) === 'stellar-civilization-lattice'
      ? 'lattice'
      : 'kardashev');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(prefix))
    throw new Error('Invalid KARDASHEV_DEMO_PREFIX');
  return {
    ...options,
    root,
    configRoot,
    outputDir,
    prefix,
    check: !!(options.check || options.ci),
  };
}

function assertFiniteTree(value, label = '$') {
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error(`Non-finite number at ${label}`);
  if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value))
      assertFiniteTree(item, `${label}.${key}`);
}

function unique(items, key, label) {
  const keys = items.map((item) => item[key]);
  if (new Set(keys).size !== keys.length) throw new Error(`Duplicate ${label}`);
  return new Set(keys);
}

function assertGraph(items, label) {
  const ids = unique(items, 'id', `${label} id`);
  const graph = new Map(
    items.map((item) => [item.id, item.dependencies || []])
  );
  const done = new Set(),
    visiting = new Set();
  const visit = (id) => {
    if (!ids.has(id)) throw new Error(`Unknown ${label} dependency: ${id}`);
    if (visiting.has(id)) throw new Error(`Cyclic ${label} dependency: ${id}`);
    if (done.has(id)) return;
    visiting.add(id);
    graph.get(id).forEach(visit);
    visiting.delete(id);
    done.add(id);
  };
  ids.forEach(visit);
}

function validateInputs(manifest, { energy, fabric, lattice } = {}) {
  assertFiniteTree({ manifest, energy, fabric, lattice });
  if (!Number.isFinite(Date.parse(manifest.generatedAt)))
    throw new Error('Invalid manifest generatedAt timestamp');
  const thermostat = manifest.energyProtocols.thermostat;
  if (
    !(
      thermostat.minKelvin <= thermostat.targetKelvin &&
      thermostat.targetKelvin <= thermostat.maxKelvin
    )
  ) {
    throw new Error(
      'Thermostat must satisfy minKelvin <= targetKelvin <= maxKelvin'
    );
  }
  const federations = unique(manifest.federations, 'slug', 'federation slug');
  const domains = unique(
    manifest.federations.flatMap((f) => f.domains),
    'slug',
    'domain slug'
  );
  const sentinels = unique(
    manifest.federations.flatMap((f) => f.sentinels),
    'slug',
    'sentinel slug'
  );
  unique(
    manifest.federations.flatMap((f) => f.capitalStreams),
    'slug',
    'capital stream slug'
  );
  const checkRef = (set, id, label) => {
    if (!set.has(id)) throw new Error(`Unknown ${label}: ${id}`);
  };
  for (const f of manifest.federations)
    for (const item of [...f.sentinels, ...f.capitalStreams]) {
      for (const id of item.domains) checkRef(domains, id, 'domain');
    }
  for (const window of manifest.energyWindows || [])
    checkRef(federations, window.federation, 'energy-window federation');
  const corridors = unique(
    manifest.logisticsCorridors || [],
    'id',
    'logistics corridor id'
  );
  for (const c of manifest.logisticsCorridors || []) {
    checkRef(federations, c.fromFederation, 'corridor origin');
    checkRef(federations, c.toFederation, 'corridor destination');
    checkRef(corridors, c.failoverCorridor, 'failover corridor');
  }
  if (energy) {
    unique(energy.feeds, 'region', 'energy region');
    unique(energy.feeds, 'federationSlug', 'energy federation');
    for (const feed of energy.feeds)
      checkRef(federations, feed.federationSlug, 'energy federation');
    for (const id of federations)
      if (!energy.feeds.some((feed) => feed.federationSlug === id))
        throw new Error(`Missing energy feed: ${id}`);
  }
  if (fabric) {
    unique(fabric.shards, 'id', 'shard id');
    for (const shard of fabric.shards) {
      checkRef(federations, shard.id, 'shard federation');
      shard.domains.forEach((id) => checkRef(domains, id, 'shard domain'));
    }
  }
  if (lattice) {
    const tasks = [];
    const walk = (task) => {
      tasks.push(task);
      (task.children || []).forEach(walk);
    };
    lattice.programmes.forEach((p) => {
      checkRef(federations, p.federation, 'programme federation');
      walk(p.rootTask);
    });
    assertGraph(lattice.programmes, 'programme');
    assertGraph(tasks, 'task');
    for (const task of tasks) {
      checkRef(federations, task.federation, 'task federation');
      checkRef(domains, task.domain, 'task domain');
      checkRef(sentinels, task.sentinel, 'task sentinel');
    }
  }
}

function readinessFailures(telemetry, ledger) {
  assertFiniteTree({ telemetry, ledger });
  const failures = ledger.checks
    .filter((c) => !c.status && ['critical', 'high'].includes(c.severity))
    .map((c) => c.title);
  const required = {
    'Manifesto hash': telemetry.manifest.manifestoHashMatches,
    'Plan hash': telemetry.manifest.planHashMatches,
    'Guardian coverage': telemetry.governance.coverageOk,
    'Energy agreement': telemetry.energy.tripleCheck,
    'Bridge latency': Object.values(telemetry.bridges).every(
      (b) => b.withinFailsafe
    ),
  };
  for (const [name, ok] of Object.entries(required))
    if (ok !== true) failures.push(name);
  return [...new Set(failures)];
}

function provenance(files, prefix) {
  return {
    schemaVersion: 1,
    mode: 'deterministic-simulation',
    prefix,
    evidence:
      'Computed from local fixtures. No provider observations, signatures, transactions or physical infrastructure verified.',
    inputs: files.map((file) => ({
      name: path.basename(file),
      sha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(file))
        .digest('hex'),
    })),
  };
}

function portableDocument(file) {
  const repoRoot = path.resolve(__dirname, '../../..');
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\]\(([^)]+\.md(?:#[^)]*)?)\)/g, (match, target) => {
      if (/^(?:https?:|#)/.test(target)) return match;
      if (/^(?:\.\.\/)?COMPUTER-WORK\.md$/.test(target))
        return '](COMPUTER-WORK.md)';
      const [relative, anchor] = target.split('#');
      const absolute = path.resolve(path.dirname(file), relative);
      const repositoryPath = path.relative(repoRoot, absolute);
      if (repositoryPath.startsWith('..') || path.isAbsolute(repositoryPath))
        return match;
      return `](https://github.com/MontrealAI/AGIJobsv0/blob/main/${repositoryPath
        .split(path.sep)
        .map(encodeURIComponent)
        .join('/')}${anchor ? '#' + anchor : ''})`;
    });
}

function dashboardArtifacts(root, outputDir) {
  const common = path.resolve(__dirname, '..');
  const index = fs
    .readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(/\.\/output\//g, './')
    .replaceAll('../ui/computer-work', './ui/computer-work')
    .replace('data-asset-base="./output"', 'data-asset-base="."')
    .replace(
      'window.__KARDASHEV_ASSET_BASE__ = "./output";',
      'window.__KARDASHEV_ASSET_BASE__ = ".";'
    );
  const sharedFiles = [
    'computer-work.mjs',
    'computer-work-model.mjs',
    'computer-work.css',
  ];
  const shared = sharedFiles.map((file) => ({
    file: `ui/${file}`,
    content: fs.readFileSync(path.join(common, 'ui', file), 'utf8'),
  }));
  const artifacts = [
    ['index.html', index],
    ['README.md', portableDocument(path.join(root, 'README.md'))],
    [
      'COMPUTER-WORK.md',
      portableDocument(path.join(common, 'COMPUTER-WORK.md')),
    ],
    ...['style.css', 'dashboard.js'].map((file) => [
      `ui/${file}`,
      fs.readFileSync(path.join(root, 'ui', file), 'utf8'),
    ]),
    [
      'ui/runtime.js',
      fs.readFileSync(path.join(common, 'ui/runtime.js'), 'utf8'),
    ],
    [
      'mermaid/mermaid.min.js',
      fs.readFileSync(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8'),
    ],
    ...shared.map(({ file, content }) => [file, content]),
  ].map(([file, content]) => ({ path: path.join(outputDir, file), content }));
  return artifacts;
}

module.exports = {
  parseOptions,
  resolveOptions,
  validateInputs,
  assertFiniteTree,
  readinessFailures,
  provenance,
  dashboardArtifacts,
  portableDocument,
};
