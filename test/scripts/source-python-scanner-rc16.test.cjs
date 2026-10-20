'use strict';
// Pending-contract and real Git metadata tests only: no successful scan fixture.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  profile,
  validatePreparedProfile: validateProfile,
  verifyPreparedPublicationReview: verifyPublicationReview,
} = require('../../scripts/release/source-profile-rc16.cjs');
const {
  requiredPaths,
  requiredChecks,
  verifyScannerReviewBinding,
} = require('../../scripts/release/qualify-source-release-rc16.cjs');
const {
  expectedPythonSources,
  verifyPythonToolComponents,
  validatePythonDescriptorReferences,
  verifyPythonScannerProducerArchive,
  verifyPythonScannerReviewBinding,
  pythonProducerExecutionContext,
} = require('../../scripts/release/python-scanner-rc16.cjs');
const pendingProfile = () => ({
  ...structuredClone(profile),
  scannerReview: null,
  pythonScannerReview: null,
});
const git = (...args) =>
  execFileSync(
    'git',
    ['--no-replace-objects', '-C', path.resolve(__dirname, '../..'), ...args],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
test('Python source coverage derives all eight immutable integration files', () => {
  const actual = expectedPythonSources(git, profile.pythonScannerBaseline);
  assert.deepEqual(actual, profile.pythonScannerRequiredPaths);
  assert.equal(actual.length, 8);
  assert(requiredPaths.includes(profile.pythonScannerPolicy.workflowPath));
  assert(requiredChecks.includes('Python integration CodeQL analysis'));
});
test('Python evidence refuses incomplete archives and missing external identities before reading reports', () => {
  const unread = () => {
    throw Error('Report must remain unread without external identity');
  };
  assert.throws(
    () => verifyPythonScannerProducerArchive(['python.sarif'], unread),
    /inventory/i
  );
  assert.throws(
    () =>
      verifyPythonScannerProducerArchive(
        profile.pythonScannerPolicy.archiveFiles,
        unread
      ),
    /external|identity/i
  );
});
test('both scanner reviews remain pending and publication fails closed', () => {
  assert.equal(pendingProfile().scannerReview, null);
  assert.equal(pendingProfile().pythonScannerReview, null);
  assert.throws(
    () =>
      verifyPythonScannerReviewBinding({
        sha: profile.pythonScannerBaseline,
        review: null,
        git,
      }),
    /review/i
  );
  assert.throws(
    () => verifyPublicationReview(pendingProfile()),
    /publication blocked/
  );
});

// These records exercise Git/profile metadata installation only. They are not
// SARIF fixtures, authenticated workflow identities, dispositions or scan proof.
const SYNTHETIC_REVIEW_METADATA_ONLY_NOT_SCAN_EVIDENCE =
  'SYNTHETIC_REVIEW_METADATA_ONLY_NOT_SCAN_EVIDENCE';
function reviewMetadataFixture() {
  const source = 'a'.repeat(40),
    tree = 'e'.repeat(40);
  const js = {
    sourceCommit: source,
    results: [],
    reviewEvidence: [SYNTHETIC_REVIEW_METADATA_ONLY_NOT_SCAN_EVIDENCE],
  };
  const py = {
    schema: 'agijobsv0/codeql-python-review/2',
    producerEvent: 'push',
    producerHeadBranch: 'fix/processed-codeql-release-proof-20261020',
    producerRef: 'refs/heads/fix/processed-codeql-release-proof-20261020',
    sourceCommit: source,
    tree,
    producerRunId: 1000000000000001,
    producerRunAttempt: 1,
    artifactId: 1000000000000002,
    artifactName: `python-codeql-security-report-${source}-1000000000000001-1`,
    archiveSha256: '1'.repeat(64),
    rawRecords: Object.fromEntries(
      [
        'python.sarif',
        'source-extraction.json',
        'source-scope-after.json',
        'source-scope-before.json',
      ].map((name) => [name, '2'.repeat(64)])
    ),
    toolComponents: [
      {
        name: 'CodeQL',
        semanticVersion: SYNTHETIC_REVIEW_METADATA_ONLY_NOT_SCAN_EVIDENCE,
        rules: [{ id: 'test-only/metadata' }],
      },
    ],
    codeqlConfigSummary: {
      testOnly: SYNTHETIC_REVIEW_METADATA_ONLY_NOT_SCAN_EVIDENCE,
    },
    successfulExtractionFiles: [
      'integrations/alpha-agent/SYNTHETIC_METADATA_ONLY.py',
    ],
    requiredExtractedFiles: [
      'integrations/alpha-agent/SYNTHETIC_METADATA_ONLY.py',
    ],
    ruleIds: ['test-only/metadata'],
    rawResultCount: 0,
    results: [],
    reviewEvidence: [SYNTHETIC_REVIEW_METADATA_ONLY_NOT_SCAN_EVIDENCE],
  };
  const base = {
    scannerReview: null,
    pythonScannerReview: null,
    qualification: 'SYNTHETIC_PENDING_NOT_QUALIFIED',
    pins: { fixed: SYNTHETIC_REVIEW_METADATA_ONLY_NOT_SCAN_EVIDENCE },
  };
  return { source, tree, js, py, base };
}
function metadataGit(fixture, nodes, changedPaths = {}) {
  const profiles = new Map([
    [fixture.source, fixture.base],
    ...nodes.map((node) => [node.sha, node.profile]),
  ]);
  const parents = new Map([
    [fixture.source, []],
    ...nodes.map((node) => [node.sha, node.parents]),
  ]);
  const ancestor = (from, to) =>
    from === to ||
    (parents.get(to) || []).some((parent) => ancestor(from, parent));
  return (command, ...args) => {
    if (command === 'merge-base') {
      assert(
        ancestor(args[1], args[2]),
        'Synthetic review source is not an ancestor'
      );
      return '';
    }
    if (command === 'rev-parse') return fixture.tree + '\n';
    if (command === 'ls-tree')
      return '100644 blob ' + 'd'.repeat(40) + '\t' + args.at(-1) + '\0';
    if (command === 'show') {
      if (args[0].endsWith(':docs/production/RELEASE_NOTES_SOURCE_RC16.md'))
        return '<!-- rc16-scanner-review\nnull\n-->\n';
      const commit = args[0].split(':')[0];
      assert(profiles.has(commit), 'Unknown synthetic profile source');
      return JSON.stringify(profiles.get(commit));
    }
    if (command === 'rev-list') {
      const [from, to] = args.at(-1).split('..');
      return (
        nodes
          .filter((node) => ancestor(from, node.sha) && ancestor(node.sha, to))
          .map((node) => [node.sha, ...node.parents].join(' '))
          .join('\n') + '\n'
      );
    }
    if (command === 'diff') {
      const [from, to] = args.filter((arg) => /^[a-f0-9]{40}$/.test(arg));
      const paths =
        changedPaths[from + '..' + to] ||
        (JSON.stringify(profiles.get(from)) === JSON.stringify(profiles.get(to))
          ? []
          : ['scripts/release/source-profile-rc16.json']);
      return paths.map((name) => name + '\0').join('');
    }
    throw Error('Unexpected synthetic metadata command: ' + command);
  };
}
function verifyMetadataBoth(fixture, nodes, changedPaths) {
  const sha = nodes.at(-1).sha,
    git = metadataGit(fixture, nodes, changedPaths);
  verifyScannerReviewBinding({ sha, review: fixture.js, git });
  verifyPythonScannerReviewBinding({ sha, review: fixture.py, git });
}
test('synthetic review metadata permits simultaneous installation and both language orders', () => {
  const f = reviewMetadataFixture(),
    first = 'b'.repeat(40),
    final = 'c'.repeat(40);
  const both = { ...f.base, scannerReview: f.js, pythonScannerReview: f.py };
  verifyMetadataBoth(f, [{ sha: final, parents: [f.source], profile: both }]);
  for (const slot of ['scannerReview', 'pythonScannerReview']) {
    const record = slot === 'scannerReview' ? f.js : f.py;
    verifyMetadataBoth(f, [
      {
        sha: first,
        parents: [f.source],
        profile: { ...f.base, [slot]: record },
      },
      { sha: final, parents: [first], profile: both },
    ]);
  }
  assert.equal(pendingProfile().scannerReview, null);
  assert.equal(pendingProfile().pythonScannerReview, null);
});
test('synthetic review metadata permits profile-only merge parents while preserving installed records', () => {
  const f = reviewMetadataFixture(),
    left = 'b'.repeat(40),
    right = 'c'.repeat(40),
    merge = 'd'.repeat(40);
  verifyMetadataBoth(f, [
    {
      sha: left,
      parents: [f.source],
      profile: { ...f.base, scannerReview: f.js },
    },
    {
      sha: right,
      parents: [f.source],
      profile: { ...f.base, pythonScannerReview: f.py },
    },
    {
      sha: merge,
      parents: [left, right],
      profile: { ...f.base, scannerReview: f.js, pythonScannerReview: f.py },
    },
  ]);
});
test('synthetic review metadata rejects replacement through an older all-null source', () => {
  const f = reviewMetadataFixture(),
    first = 'b'.repeat(40),
    final = 'c'.repeat(40);
  for (const slot of ['scannerReview', 'pythonScannerReview']) {
    const original = slot === 'scannerReview' ? f.js : f.py;
    const replaced = {
      ...original,
      reviewEvidence: [
        SYNTHETIC_REVIEW_METADATA_ONLY_NOT_SCAN_EVIDENCE + '_CHANGED',
      ],
    };
    const both = {
      ...f.base,
      scannerReview: f.js,
      pythonScannerReview: f.py,
      [slot]: replaced,
    };
    const nodes = [
      {
        sha: first,
        parents: [f.source],
        profile: { ...f.base, [slot]: original },
      },
      { sha: final, parents: [first], profile: both },
    ];
    assert.throws(
      () =>
        verifyPythonScannerReviewBinding({
          sha: final,
          review: both.pythonScannerReview,
          git: metadataGit(f, nodes),
        }),
      /cannot be.*replaced/
    );
  }
});
test('synthetic review metadata rejects qualification, pin, executable and peer-record changes', () => {
  const f = reviewMetadataFixture(),
    final = 'c'.repeat(40);
  const both = { ...f.base, scannerReview: f.js, pythonScannerReview: f.py };
  for (const alter of [
    (value) => {
      value.qualification = 'SYNTHETIC_CHANGED_QUALIFICATION';
    },
    (value) => {
      value.pins.fixed = 'SYNTHETIC_CHANGED_PIN';
    },
    (value) => {
      value.scannerReview = { ...f.js, arbitraryApproval: true };
    },
    (value) => {
      value.pythonScannerReview = { ...f.py, arbitraryApproval: true };
    },
    (value) => {
      value.pythonScannerReview.tree = '9'.repeat(40);
    },
  ]) {
    const changed = structuredClone(both);
    alter(changed);
    assert.throws(() =>
      verifyScannerReviewBinding({
        sha: final,
        review: changed.scannerReview,
        git: metadataGit(f, [
          { sha: final, parents: [f.source], profile: changed },
        ]),
      })
    );
  }
  assert.throws(
    () =>
      verifyMetadataBoth(
        f,
        [{ sha: final, parents: [f.source], profile: both }],
        {
          [f.source + '..' + final]: [
            'scripts/release/source-profile-rc16.json',
            'SYNTHETIC_METADATA_ONLY.js',
          ],
        }
      ),
    /outside the exact two review metadata paths/
  );
});
test('synthetic review metadata refuses an unbounded installation history', () => {
  const f = reviewMetadataFixture(),
    both = { ...f.base, scannerReview: f.js, pythonScannerReview: f.py };
  const nodes = [];
  for (let index = 1; index <= 65; index++)
    nodes.push({
      sha: index.toString(16).padStart(40, '0'),
      parents: [nodes.at(-1)?.sha || f.source],
      profile: both,
    });
  assert.throws(
    () => verifyMetadataBoth(f, nodes),
    /exceeds its bound|exceeds 64/
  );
});

test('synthetic dual-review lifecycle admits only installed source-bound metadata with fixed profile pins', () => {
  // SYNTHETIC_REVIEW_METADATA_ONLY_NOT_SCAN_EVIDENCE: this exercises profile
  // admission only. Both actual archive validators and hosted checks remain
  // separate mandatory gates, and real profile records stay null.
  const f = reviewMetadataFixture();
  f.base = pendingProfile();
  const first = 'b'.repeat(40),
    final = 'c'.repeat(40);
  const installed = {
    ...f.base,
    scannerReview: f.js,
    pythonScannerReview: f.py,
  };
  assert.throws(
    () => verifyPublicationReview(pendingProfile()),
    /blocked|pending/
  );
  for (const slot of [null, 'scannerReview', 'pythonScannerReview']) {
    const nodes = [];
    if (slot)
      nodes.push({
        sha: first,
        parents: [f.source],
        profile: { ...f.base, [slot]: slot === 'scannerReview' ? f.js : f.py },
      });
    nodes.push({
      sha: final,
      parents: [slot ? first : f.source],
      profile: installed,
    });
    const git = metadataGit(f, nodes);
    if (slot) {
      validateProfile(nodes[0].profile, { git, target: first });
      assert.throws(
        () => verifyPublicationReview(nodes[0].profile, { git, target: first }),
        /blocked|pending/
      );
    }
    validateProfile(installed, { git, target: final });
    assert.deepEqual(
      verifyPublicationReview(installed, { git, target: final }),
      {
        metadataAdmissionOnly: true,
        productionApproved: false,
      }
    );
  }
  assert.throws(
    () => verifyPublicationReview(installed),
    /Git|source|identity/
  );
  assert.throws(
    () =>
      verifyPublicationReview(installed, {
        git: metadataGit(f, []),
        target: f.source,
      }),
    /installed|profile|differ/
  );
  for (const alter of [
    (value) => {
      value.pythonScannerReview = { ...f.py, arbitraryApproval: true };
    },
    (value) => {
      value.qualification = 'SYNTHETIC_CHANGED_QUALIFICATION';
    },
    (value) => {
      value.compilerSourceBaseline = 'f'.repeat(40);
    },
  ]) {
    const changed = structuredClone(installed);
    alter(changed);
    const git = metadataGit(f, [
      { sha: final, parents: [f.source], profile: changed },
    ]);
    assert.throws(() => validateProfile(changed, { git, target: final }));
    assert.throws(() =>
      verifyPublicationReview(changed, { git, target: final })
    );
  }
  assert.equal(pendingProfile().scannerReview, null);
  assert.equal(pendingProfile().pythonScannerReview, null);
});

test('inert Python producer contexts preserve approved premerge S1 and mandatory main S2 roles', () => {
  const f = reviewMetadataFixture();
  assert.deepEqual(pythonProducerExecutionContext(), {
    event: 'push',
    headBranch: 'main',
    ref: 'refs/heads/main',
  });
  assert.deepEqual(
    pythonProducerExecutionContext({ role: 'final', review: f.py }),
    { event: 'push', headBranch: 'main', ref: 'refs/heads/main' }
  );
  assert.deepEqual(
    pythonProducerExecutionContext({ role: 'reviewed', review: f.py }),
    profile.pythonScannerPolicy.reviewedProducer
  );
  for (const mutate of [
    (record) => {
      record.producerEvent = 'workflow_dispatch';
    },
    (record) => {
      record.producerHeadBranch = 'main';
    },
    (record) => {
      record.producerHeadBranch += '-other';
    },
    (record) => {
      record.producerRef = 'refs/heads/main';
    },
    (record) => {
      record.schema = 'agijobsv0/codeql-python-review/1';
    },
  ]) {
    const record = structuredClone(f.py);
    mutate(record);
    assert.throws(() =>
      pythonProducerExecutionContext({ role: 'reviewed', review: record })
    );
  }
  assert.throws(() => pythonProducerExecutionContext({ role: 'reviewed' }));
  assert.throws(() =>
    pythonProducerExecutionContext({ role: 'arbitrary', review: f.py })
  );
});

test('the live installed review profile is independently bound to its actual immutable Git source', () => {
  const target = git('rev-parse', 'HEAD').trim();
  assert.equal(validateProfile(profile, { git, target }), profile);
});

function descriptorMetadataOnly() {
  return {
    tool: {
      driver: {
        name: 'SYNTHETIC_METADATA_ONLY',
        rules: [{ id: 'metadata/rule-a' }, { id: 'metadata/rule-b' }],
        notifications: [
          { id: 'metadata/note-a' },
          { id: 'metadata/note-b' },
        ],
      },
      extensions: [
        {
          name: 'SYNTHETIC_EXTENSION_ONLY',
          guid: 'metadata-component-guid',
          rules: [{ id: 'metadata/extension-rule' }],
          notifications: [{ id: 'metadata/extension-note' }],
        },
      ],
    },
    invocations: [
      {
        toolExecutionNotifications: [
          { descriptor: { id: 'metadata/note-b', index: 1 } },
        ],
        toolConfigurationNotifications: [
          { associatedRule: { id: 'metadata/rule-a', index: 0 } },
        ],
        ruleConfigurationOverrides: [
          { descriptor: { id: 'metadata/rule-b', index: 1 } },
        ],
        notificationConfigurationOverrides: [
          { descriptor: { id: 'metadata/note-a', index: 0 } },
        ],
      },
    ],
    results: [
      {
        ruleId: 'metadata/rule-b',
        ruleIndex: 1,
        rule: { id: 'metadata/rule-b', index: 1 },
      },
    ],
    properties: {
      metricResults: [
        {
          ruleId: 'metadata/extension-rule',
          rule: {
            id: 'metadata/extension-rule',
            index: 0,
            toolComponent: {
              index: 0,
              name: 'SYNTHETIC_EXTENSION_ONLY',
              guid: 'metadata-component-guid',
            },
          },
        },
      ],
    },
  };
}
test('descriptor metadata comparison preserves full records and original arrays', () => {
  // Metadata unit inputs only: not a successful scan or disposition fixture.
  const left = [
    {
      name: 'SYNTHETIC_METADATA_ONLY',
      rules: [
        { id: 'metadata/a', properties: { detail: 'complete-a' } },
        { id: 'metadata/b', properties: { detail: 'complete-b' } },
      ],
      notifications: [{ id: 'metadata/x' }, { id: 'metadata/y' }],
    },
  ];
  const right = structuredClone(left);
  right[0].rules.reverse();
  right[0].notifications.reverse();
  const before = structuredClone([left, right]);
  verifyPythonToolComponents(left, right);
  assert.deepEqual([left, right], before);
  for (const change of [
    (value) => {
      value[0].rules[0].properties.detail = 'changed-complete-record';
    },
    (value) => {
      value[0].rules.push(structuredClone(value[0].rules[0]));
    },
    (value) => {
      delete value[0].notifications;
    },
    (value) => {
      value[0].name = 'changed-component';
    },
  ]) {
    const changed = structuredClone(right);
    change(changed);
    assert.throws(() => verifyPythonToolComponents(left, changed));
  }
  assert.throws(() =>
    verifyPythonToolComponents(
      [{ name: 'a', rules: [] }, { name: 'b', rules: [] }],
      [{ name: 'b', rules: [] }, { name: 'a', rules: [] }]
    )
  );
});
test('duplicate descriptor IDs retain strict ordering and multiplicity', () => {
  for (const key of ['rules', 'notifications']) {
    const left = [
      {
        name: 'SYNTHETIC_METADATA_ONLY',
        [key]: [
          { id: 'metadata/duplicate', name: 'first' },
          { id: 'metadata/duplicate', name: 'second' },
        ],
      },
    ];
    verifyPythonToolComponents(left, structuredClone(left));
    const reversed = structuredClone(left);
    reversed[0][key].reverse();
    assert.throws(() => verifyPythonToolComponents(left, reversed));
    const missing = structuredClone(left);
    missing[0][key].pop();
    assert.throws(() => verifyPythonToolComponents(left, missing));
  }
});
test('descriptor metadata references bind original ordinals and components', () => {
  const value = descriptorMetadataOnly();
  const before = structuredClone(value);
  validatePythonDescriptorReferences(value);
  assert.deepEqual(value, before);
  const guidOnlyComponent = structuredClone(value);
  delete guidOnlyComponent.properties.metricResults[0].rule.toolComponent.index;
  validatePythonDescriptorReferences(guidOnlyComponent);
  const legacy = structuredClone(value);
  delete legacy.results[0].rule;
  validatePythonDescriptorReferences(legacy);
});
test('descriptor metadata refuses inconsistent or unsupported reference forms', () => {
  for (const change of [
    (value) => {
      value.results[0].ruleIndex = 0;
    },
    (value) => {
      value.results[0].ruleId = 'metadata/different';
    },
    (value) => {
      value.invocations[0].toolExecutionNotifications[0].descriptor.index = 0;
    },
    (value) => {
      value.invocations[0].toolConfigurationNotifications[0].associatedRule.id =
        'metadata/different';
    },
    (value) => {
      value.invocations[0].ruleConfigurationOverrides[0].descriptor.index = 0;
    },
    (value) => {
      value.invocations[0].notificationConfigurationOverrides[0].descriptor.id =
        'metadata/different';
    },
    (value) => {
      value.properties.metricResults[0].rule.toolComponent.index = 1;
    },
    (value) => {
      value.properties.metricResults[0].rule.toolComponent.name = 'different';
    },
    (value) => {
      value.properties.metricResults[0].rule.toolComponent.guid = 'different';
    },
    (value) => {
      value.properties.metricResults[0].rule.guid = 'missing-descriptor-guid';
    },
    (value) => {
      delete value.properties.metricResults[0].rule.id;
    },
    (value) => {
      delete value.properties.metricResults[0].rule.index;
    },
    (value) => {
      value.tool.driver.rules[0].relationships = [
        { target: { id: 'metadata/rule-b', index: 1 } },
      ];
    },
    (value) => {
      value.results[0].taxa = [{ id: 'metadata/unsupported', index: 0 }];
    },
    (value) => {
      value.threadFlowLocations = [
        { taxa: [{ id: 'metadata/unsupported', index: 0 }] },
      ];
    },
    (value) => {
      value.taxonomies = [{ name: 'unsupported' }];
    },
    (value) => {
      value.conversion = { tool: { driver: { name: 'unsupported' } } };
    },
  ]) {
    const changed = descriptorMetadataOnly();
    change(changed);
    assert.throws(() => validatePythonDescriptorReferences(changed));
  }
});
