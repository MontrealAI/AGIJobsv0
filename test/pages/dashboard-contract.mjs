import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Independent of the generated manifest: preserve every legacy deck, including
// nested output pages, and register additions explicitly for branch integration.
export const legacyDashboardRoutes = [
  'experiments/alpha-agi-mark/',
  'experiments/phase6/',
  'experiments/kardashev-ii/',
  'experiments/kardashev-ii/k2-stellar-demo/',
  'experiments/kardashev-ii/k2-stellar-demo/output/',
  'experiments/kardashev-ii/output/',
  'experiments/kardashev-ii/stellar-civilization-lattice/',
  'experiments/kardashev-ii/stellar-civilization-lattice/output/',
  'experiments/kardashev-business/',
  'experiments/omnisovereign/',
  'experiments/zenith-hypernova/',
  'experiments/meta-agentic-alpha/',
  'experiments/huxley-godel/',
  'experiments/program-synthesis/',
  'experiments/phase8/workbench/',
];

export const dashboardAdditions = [
  {
    route: 'experiments/omniphoenix/',
    source: 'demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/web',
  },
  {
    route: 'experiments/governance/',
    source: 'demo/solving-alpha-agi-governance/web',
  },
  {
    route: 'experiments/atlas/',
    source: 'demo/OMNI-CONCORD-ASCENSION-ATLAS/web',
  },
  {
    route: 'experiments/iconic/',
    source: 'demo/ICONIC-OPERATING-SYSTEM-DEMO/web',
  },
  { route: 'experiments/polaris/', source: 'demo/polaris-concordat/web' },
  {
    route: 'experiments/celestial/',
    source: 'demo/CELESTIAL-SOVEREIGN-ORBITAL-AGI-OS-GRAND-DEMONSTRATION/web',
  },
  { route: 'experiments/zenith/', source: 'demo/zenith-sapience/web' },
  {
    route: 'experiments/omega/',
    source: 'demo/zenith-sapience-initiative-omega-omni-operating-system/web',
  },
  {
    route: 'experiments/empowerment/',
    source: 'demo/superintelligent-empowerment/web',
  },
];

export function implementedDashboards(root) {
  // Check the implementation directory, not index.html, so a deleted entry page
  // cannot silently remove a registered implementation from the expectation.
  return dashboardAdditions.filter(({ source }) =>
    fs.existsSync(path.join(root, source))
  );
}

export function expectedDashboardRoutes(root) {
  return [
    ...legacyDashboardRoutes,
    ...implementedDashboards(root).map(({ route }) => route),
  ];
}

export function assertDashboardRoutes(actual, expected) {
  assert.equal(
    new Set(actual).size,
    actual.length,
    'Dashboard routes must be unique'
  );
  assert.deepEqual(
    [...actual].sort(),
    [...expected].sort(),
    'Dashboard routes must match the explicit source inventory (no missing or unexpected routes)'
  );
}

export function expectedCatalogKindLinks(catalog, basePath, kind) {
  const links = catalog
    .filter((demo) => demo.kindId === kind)
    .map((demo) => `${basePath}demos/${demo.id}/`);
  assert.equal(
    new Set(links).size,
    links.length,
    'Source catalog IDs must be unique'
  );
  return links;
}

export function assertCatalogKindLinks(actual, expected) {
  assert.equal(
    new Set(actual).size,
    actual.length,
    'Visible catalog cards must be unique'
  );
  assert.deepEqual(
    [...actual].sort(),
    [...expected].sort(),
    'Visible filtered cards must exactly match the source catalog, including empty categories'
  );
}

// These are the seven original design-only entries. Each becomes a bounded
// implementation only when its reviewed workspace exists in this source tree.
export const originalDesignNames = [
  'CELESTIAL-SOVEREIGN-ORBITAL-AGI-OS-GRAND-DEMONSTRATION',
  'ICONIC-OPERATING-SYSTEM-DEMO',
  'OMNI-CONCORD-ASCENSION-ATLAS',
  'polaris-concordat',
  'solving-alpha-agi-governance',
  'zenith-sapience',
  'zenith-sapience-initiative-omega-omni-operating-system',
];

export function expectedDesignLinks(catalog, root, basePath) {
  const expectedNames = originalDesignNames.filter(
    (name) => !fs.existsSync(path.join(root, 'demo', name, 'web'))
  );
  const actualNames = catalog
    .filter((demo) => demo.kindId === 'design')
    .map((demo) => demo.name);
  assert.deepEqual(
    [...actualNames].sort(),
    [...expectedNames].sort(),
    'Design classifications must match the fixed original identities minus implemented workspaces'
  );
  return expectedCatalogKindLinks(catalog, basePath, 'design');
}
