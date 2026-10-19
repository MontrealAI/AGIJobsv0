import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRONTIER_COMPUTER_HTML_LIMIT,
  FRONTIER_MISSION_LIMITS,
  FRONTIER_MISSION_PRESETS,
  createFrontierMission,
  verifyFrontierMission,
  exportFrontierMission,
  restoreFrontierMission,
  createFrontierWorkspace,
  sealFrontierWorkspace,
  verifyFrontierWorkspace,
  proposeFrontierFormulation,
  approveFrontierFormulation,
  exportFrontierWorkspace,
  restoreFrontierWorkspace,
  importFrontierDeskDraft,
  createFrontierComputerTask,
  buildFrontierWorkPrompt,
  exportFrontierBrief,
  compileFrontierMissionJobs,
} from '../src/frontier-mission.mjs';
import { canonicalize, digestBytes, digestObject } from '../src/integrity.mjs';
import { verifyWorkOrderSeal } from '../src/compiler.mjs';

const copy = (value) => JSON.parse(JSON.stringify(value));
const input = (preset = 'business') => ({
  ...copy(FRONTIER_MISSION_PRESETS[preset]),
  rights: {
    publicNonPersonal: true,
    license:
      'Public nonpersonal inputs; source rights require separate verification.',
  },
  sources: [
    {
      id: 'paper',
      title: 'Exact public paper',
      url: 'https://arxiv.org/abs/2303.12712',
      text: 'Owner-supplied excerpt; not independently retrieved.',
    },
  ],
});
const mission = (preset) => createFrontierMission(input(preset));
const rejects = (operation, code) =>
  assert.rejects(operation, (error) => error.code === code);

test('business and mathematics are useful prepared research programmes, never simulated completed results', async () => {
  for (const preset of ['business', 'mathematics']) {
    const sealed = await mission(preset);
    assert.equal(sealed.kind, 'FrontierMission');
    assert.equal(sealed.preset, preset);
    assert.equal(sealed.provenance.status, 'PLANNED_NOT_EXECUTED');
    assert.equal(sealed.provenance.independentProof, false);
    assert.equal(sealed.provenance.mathematicalProof, 'NOT_ESTABLISHED');
    assert.equal(sealed.provenance.modelPerformance, 'NOT_EVALUATED');
    assert.equal(sealed.provenance.authorityCreated, 'NONE');
    assert.ok(Object.isFrozen(sealed.hardRequirements));
    const { digest, ...body } = sealed;
    assert.equal(
      digest,
      await digestObject('successor.frontier-mission.v1', body)
    );
    assert.equal(
      sealed.sources[0].textDigest,
      await digestBytes(sealed.sources[0].text)
    );
    assert.equal(sealed.sources[0].retrievalStatus, 'NOT_RETRIEVED');
  }
});

test('default presets do not silently attest rights for a new owner', async () => {
  for (const preset of Object.values(FRONTIER_MISSION_PRESETS)) {
    await rejects(
      () => createFrontierMission(preset),
      'FRONTIER_RIGHTS_REQUIRED'
    );
  }
  const bad = input();
  bad.rights.publicNonPersonal = 'true';
  await rejects(() => createFrontierMission(bad), 'FRONTIER_RIGHTS_REQUIRED');
});

test('exact credential-free public source permissions exclude ambiguous destinations', async () => {
  const invalid = [
    'http://arxiv.org/abs/2303.12712',
    'https://user:password@arxiv.org/paper',
    'https://arxiv.org:444/paper',
    'https://arxiv.org/paper#part',
    'https://arxiv.org/paper#',
    'https://arxiv.org/a b',
    'https://arxiv.org\\@evil.com/paper',
    'https://localhost/private',
    'https://127.0.0.1/private',
    'https://0x7f000001/private',
    'https://[::1]/private',
    'https://service.internal/private',
    'https://arxiv.org./paper',
    'https://arxiv.org/paper?api_key=credential',
    'https://arxiv.org/paper?%74oken=credential',
    'https://arxiv.org/paper?X-Amz-Signature=credential',
    'https://arxiv.org:443/abs/2303.12712?version=1',
    'https://arxiv.org',
  ];
  for (const url of invalid) {
    const bad = input();
    bad.sources[0].url = url;
    await rejects(() => createFrontierMission(bad), 'FRONTIER_SOURCE_URL');
  }
  const exact = input();
  exact.sources[0].url = 'https://arxiv.org/abs/2303.12712?version=1';
  assert.equal(
    (await createFrontierMission(exact)).sources[0].url,
    exact.sources[0].url
  );
  assert.equal(new URL(exact.sources[0].url).href, exact.sources[0].url);
});

test('source IDs, duplicate permissions and size bounds fail before a task can be prepared', async () => {
  const duplicate = input();
  duplicate.sources.push(copy(duplicate.sources[0]));
  await rejects(
    () => createFrontierMission(duplicate),
    'FRONTIER_SOURCE_DUPLICATE'
  );
  const invalidID = input();
  invalidID.sources[0].id = '../paper';
  await rejects(() => createFrontierMission(invalidID), 'FRONTIER_SOURCE_ID');
  const tooMany = input();
  tooMany.sources = Array.from({ length: 13 }, (_, i) => ({
    id: `source-${i}`,
    title: 'Public source',
    url: `https://arxiv.org/abs/${i}`,
  }));
  await rejects(() => createFrontierMission(tooMany), 'FRONTIER_SOURCE_LIMIT');
  const tooLong = input();
  tooLong.sources[0].text = 'x'.repeat(12001);
  await rejects(() => createFrontierMission(tooLong), 'FRONTIER_TEXT_INVALID');
  const total = input();
  total.sources = Array.from({ length: 6 }, (_, i) => ({
    id: `source-${i}`,
    title: 'Public source',
    url: `https://arxiv.org/abs/${i}`,
    text: 'x'.repeat(12000),
  }));
  await rejects(() => createFrontierMission(total), 'FRONTIER_SOURCE_LIMIT');
});

test('every mission requires a true outcome, credible alternative and explicit immutable requirements', async () => {
  for (const key of ['outcome', 'currentApproach', 'credibleAlternative']) {
    const bad = input();
    bad[key] = ' ';
    await rejects(() => createFrontierMission(bad), 'FRONTIER_TEXT_INVALID');
  }
  for (const hardRequirements of [
    [],
    ['same', 'same'],
    Array(17).fill('constraint'),
  ]) {
    await rejects(
      () => createFrontierMission({ ...input(), hardRequirements }),
      'FRONTIER_REQUIREMENTS_INVALID'
    );
  }
  const bad = input();
  bad.apiKey = 'forbidden field';
  await rejects(() => createFrontierMission(bad), 'FRONTIER_SCHEMA_INVALID');
});

test('native runtime budgets enforce exact integer admission limits', async () => {
  for (const [key, value] of [
    ['maxTurns', 31],
    ['maxActions', 0],
    ['maxSeconds', 601],
    ['reviewMinutes', 1.5],
  ]) {
    const bad = input();
    bad.budget[key] = value;
    await rejects(() => createFrontierMission(bad), 'FRONTIER_LIMIT_INVALID');
  }
});

test('mission replay rejects edited claims, altered hard requirements, invented source retrieval and proof flags', async () => {
  const original = await mission();
  for (const mutate of [
    (x) => {
      x.outcome = 'A cheaper weakened outcome';
    },
    (x) => {
      x.hardRequirements.pop();
    },
    (x) => {
      x.sources[0].retrievalStatus = 'VERIFIED';
    },
    (x) => {
      x.sources[0].textDigest = `sha256:${'0'.repeat(64)}`;
    },
    (x) => {
      x.provenance.independentProof = true;
    },
    (x) => {
      x.provenance.mathematicalProof = 'PROVEN';
    },
  ]) {
    const changed = copy(original);
    mutate(changed);
    await rejects(
      () => verifyFrontierMission(changed),
      'FRONTIER_MISSION_TAMPERED'
    );
  }
});

test('canonical export restores exact mission without executing embedded source text', async () => {
  const custom = input();
  custom.sources[0].text =
    '</script><script>globalThis.frontierInjected=true</script>\nQuoted public instructions remain untrusted.';
  const sealed = await createFrontierMission(custom);
  assert.deepEqual(
    await restoreFrontierMission(await exportFrontierMission(sealed)),
    sealed
  );
  assert.deepEqual(await restoreFrontierMission(canonicalize(sealed)), sealed);
  assert.equal(globalThis.frontierInjected, undefined);
  await rejects(
    () => restoreFrontierMission('{broken'),
    'FRONTIER_EXPORT_INVALID'
  );
  await assert.rejects(() =>
    restoreFrontierMission('{"__proto__":{"proof":true}}')
  );
  await rejects(
    () =>
      restoreFrontierMission(
        ' '.repeat(FRONTIER_MISSION_LIMITS.exportBytes + 1)
      ),
    'FRONTIER_TEXT_INVALID'
  );
});

test('ledger templates are reusable prompts with no fabricated research, execution or mathematical certification', async () => {
  const sealed = await mission('mathematics');
  const workspace = await createFrontierWorkspace(sealed);
  assert.equal(workspace.missionDigest, sealed.digest);
  assert.match(workspace.strategyLedger, /No strategy has been executed/);
  assert.match(workspace.experimentLedger, /No experiment has been run/);
  assert.match(
    workspace.evidenceLedger,
    /No external source has been retrieved/
  );
  assert.match(workspace.evidenceLedger, /proof obligations/);
  assert.deepEqual(workspace.reframing, {
    proposal: '',
    hardRequirementMapping: '',
    status: 'NOT_PROPOSED',
    ownerApproval: null,
  });
  assert.equal(workspace.provenance.classification, 'USER_ENTERED_UNVERIFIED');
  assert.equal(workspace.provenance.executionStatus, 'NOT_ATTESTED');
  assert.deepEqual(await verifyFrontierWorkspace(sealed, workspace), workspace);
});

test('a recorded strategy revision can be preserved without turning a user statement into proof', async () => {
  const sealed = await mission();
  const original = await createFrontierWorkspace(sealed);
  const edited = {
    ...original,
    strategyLedger:
      'Candidate c1 combines better triage and a redesigned handoff. Failed attempt: not performed; experiment pending.',
  };
  const next = await sealFrontierWorkspace(sealed, edited);
  assert.notEqual(next.digest, original.digest);
  assert.equal(next.provenance.independentProof, false);
  assert.equal(next.provenance.executionStatus, 'NOT_ATTESTED');
  assert.deepEqual(
    (
      await restoreFrontierWorkspace(
        await exportFrontierWorkspace(sealed, next)
      )
    ).workspace,
    next
  );
  await rejects(
    () => verifyFrontierWorkspace(sealed, edited),
    'FRONTIER_WORKSPACE_TAMPERED'
  );
});

test('the native Alpha70 HTML boundary remains exactly 200000 characters', async () => {
  assert.equal(FRONTIER_COMPUTER_HTML_LIMIT, 200000);
  const sealed = await mission();
  const boundary = `<html>${'x'.repeat(
    FRONTIER_COMPUTER_HTML_LIMIT - 13
  )}</html>`;
  assert.equal(boundary.length, FRONTIER_COMPUTER_HTML_LIMIT);
  const task = await createFrontierComputerTask(sealed, { html: boundary });
  assert.equal(task.html, boundary);
  await rejects(
    () => createFrontierComputerTask(sealed, { html: `${boundary}x` }),
    'FRONTIER_TEXT_INVALID'
  );
});

test('maximum source and ledger records remain portable and immutable when native HTML exceeds its separate limit', async () => {
  for (const character of ['x', '\u2028']) {
    const custom = input();
    let remaining = 64000;
    custom.sources = Array.from({ length: 12 }, (_, index) => {
      const count = Math.min(remaining, 12000);
      remaining -= count;
      const prefix = `https://arxiv.org/abs/${index}-`;
      return {
        id: `source-${index}`,
        title: 't'.repeat(240),
        url: prefix + 'u'.repeat(2048 - prefix.length),
        text: character.repeat(count),
      };
    });
    if (character === 'x') {
      custom.title = 't'.repeat(240);
      for (const key of [
        'question',
        'outcome',
        'currentApproach',
        'credibleAlternative',
      ])
        custom[key] = 'm'.repeat(6000);
      custom.hardRequirements = Array.from({ length: 16 }, (_, index) =>
        `${index}`.padEnd(1200, 'r')
      );
      custom.rights.license = 'l'.repeat(1000);
    }
    const sealed = await createFrontierMission(custom);
    const blank = await createFrontierWorkspace(sealed);
    const workspace = await sealFrontierWorkspace(sealed, {
      ...blank,
      strategyLedger: character.repeat(18000),
      experimentLedger: character.repeat(18000),
      evidenceLedger: character.repeat(18000),
      reframing: {
        proposal: 'p'.repeat(6000),
        hardRequirementMapping: 'h'.repeat(6000),
        status: 'PROPOSED',
        ownerApproval: null,
      },
    });
    const snapshot = canonicalize({ mission: sealed, workspace });
    const exported = await exportFrontierWorkspace(sealed, workspace);
    const restored = await restoreFrontierWorkspace(exported);
    assert.deepEqual(restored, { mission: sealed, workspace });
    assert.equal(canonicalize(restored), snapshot);
    assert.equal(
      restored.mission.sources.reduce(
        (sum, source) => sum + source.text.length,
        0
      ),
      64000
    );
    for (const key of ['strategyLedger', 'experimentLedger', 'evidenceLedger'])
      assert.equal(restored.workspace[key].length, 18000);
    assert.ok(Object.isFrozen(restored.mission.sources));
    assert.ok(Object.isFrozen(restored.workspace));
    const escapedRecord = exported.replace(
      /[<>&\u2028\u2029]/g,
      (part) => `\\u${part.charCodeAt(0).toString(16).padStart(4, '0')}`
    );
    const oversizedHTML = `<!doctype html><html><body><pre>${escapedRecord}</pre></body></html>`;
    assert.ok(oversizedHTML.length > FRONTIER_COMPUTER_HTML_LIMIT);
    await rejects(
      () => createFrontierComputerTask(sealed, { html: oversizedHTML }),
      'FRONTIER_TEXT_INVALID'
    );
    assert.equal(canonicalize({ mission: sealed, workspace }), snapshot);
    assert.equal(await exportFrontierWorkspace(sealed, workspace), exported);
    const tampered = JSON.parse(exported);
    tampered.workspace.evidenceLedger = `changed${tampered.workspace.evidenceLedger.slice(
      7
    )}`;
    await rejects(
      () => restoreFrontierWorkspace(JSON.stringify(tampered)),
      'FRONTIER_WORKSPACE_TAMPERED'
    );
  }
});

test('all field maxima round-trip within a derived portable bound for Unicode and worst JSON escaping', async () => {
  assert.equal(FRONTIER_MISSION_LIMITS.exportBytes, 1500000);
  const maximumFreeTextUnits =
    240 +
    4 * 6000 +
    16 * 1200 +
    12 * 240 +
    64000 +
    1000 +
    3 * 18000 +
    2 * 6000 +
    240 +
    2000;
  assert.equal(maximumFreeTextUnits, 179560);
  const conservativeEnvelopeBytes =
    maximumFreeTextUnits * 6 + 12 * 2048 + 12 * 48 + 16000;
  assert.ok(conservativeEnvelopeBytes < 1120000);
  assert.ok(conservativeEnvelopeBytes < FRONTIER_MISSION_LIMITS.exportBytes);
  for (const character of ['界', '\u0000', '"', '\\']) {
    const custom = input();
    custom.title = character.repeat(240);
    for (const key of [
      'question',
      'outcome',
      'currentApproach',
      'credibleAlternative',
    ])
      custom[key] = character.repeat(6000);
    custom.hardRequirements = Array.from({ length: 16 }, (_, index) =>
      `${index}`.padEnd(1200, character)
    );
    custom.rights.license = character.repeat(1000);
    let remaining = 64000;
    custom.sources = Array.from({ length: 12 }, (_, index) => {
      const count = Math.min(remaining, 12000);
      remaining -= count;
      const prefix = `https://arxiv.org/abs/${index}-`;
      return {
        id: `source-${index}`.padEnd(48, 's'),
        title: character.repeat(240),
        url: prefix + 'u'.repeat(2048 - prefix.length),
        text: character.repeat(count),
      };
    });
    const sealed = await createFrontierMission(custom);
    const proposed = await proposeFrontierFormulation(
      sealed,
      await createFrontierWorkspace(sealed),
      {
        proposal: character.repeat(6000),
        hardRequirementMapping: character.repeat(6000),
      }
    );
    const approved = await approveFrontierFormulation(sealed, proposed, {
      ownerLabel: character.repeat(240),
      reason: character.repeat(2000),
      hardRequirementsPreserved: true,
    });
    const workspace = await sealFrontierWorkspace(sealed, {
      ...approved,
      strategyLedger: character.repeat(18000),
      experimentLedger: character.repeat(18000),
      evidenceLedger: character.repeat(18000),
    });
    const snapshot = canonicalize({ mission: sealed, workspace });
    const portableMission = await exportFrontierMission(sealed);
    const portableWorkspace = await exportFrontierWorkspace(sealed, workspace);
    const bytes = new TextEncoder().encode(portableWorkspace).byteLength;
    assert.ok(bytes < conservativeEnvelopeBytes);
    if (character === '界' || character === '\u0000') assert.ok(bytes > 512000);
    assert.deepEqual(await restoreFrontierMission(portableMission), sealed);
    const restored = await restoreFrontierWorkspace(portableWorkspace);
    assert.deepEqual(restored, { mission: sealed, workspace });
    assert.equal(canonicalize(restored), snapshot);
    assert.ok(Object.isFrozen(restored.mission.sources));
    assert.ok(Object.isFrozen(restored.workspace.reframing.ownerApproval));
    assert.equal(
      restored.workspace.provenance.classification,
      'USER_ENTERED_UNVERIFIED'
    );
    assert.equal(restored.workspace.provenance.executionStatus, 'NOT_ATTESTED');
    assert.equal(restored.workspace.provenance.independentProof, false);
    assert.equal(restored.workspace.provenance.productionApproved, false);
    assert.equal(restored.workspace.provenance.authorityCreated, 'NONE');
    assert.equal(
      await exportFrontierWorkspace(sealed, workspace),
      portableWorkspace
    );
    assert.equal(canonicalize({ mission: sealed, workspace }), snapshot);
  }
});

test('portable restore enforces the shared UTF8 byte cap before parsing or replay', async () => {
  const cap = FRONTIER_MISSION_LIMITS.exportBytes;
  const exactlyOneByteOver = JSON.stringify('界'.repeat((cap - 3) / 3) + 'aa');
  assert.equal(
    new TextEncoder().encode(exactlyOneByteOver).byteLength,
    cap + 1
  );
  assert.ok(exactlyOneByteOver.length < cap);
  await rejects(
    () => restoreFrontierMission(exactlyOneByteOver),
    'FRONTIER_EXPORT_LIMIT'
  );
  await rejects(
    () => restoreFrontierWorkspace(exactlyOneByteOver),
    'FRONTIER_EXPORT_LIMIT'
  );
  const sealed = await mission();
  const oldArchive = await exportFrontierWorkspace(
    sealed,
    await createFrontierWorkspace(sealed)
  );
  assert.ok(new TextEncoder().encode(oldArchive).byteLength < 512000);
  assert.equal(
    (await restoreFrontierWorkspace(oldArchive)).mission.digest,
    sealed.digest
  );
  assert.equal(FRONTIER_COMPUTER_HTML_LIMIT, 200000);
});

test('L4 requires a complete hard-requirement mapping and explicit attributable experiment approval', async () => {
  const sealed = await mission();
  const blank = await createFrontierWorkspace(sealed);
  const proposal = await proposeFrontierFormulation(sealed, blank, {
    proposal:
      'Replace repeated individual research with a reusable decision service and shared operating evidence.',
    hardRequirementMapping: sealed.hardRequirements
      .map((item, i) => `${i + 1}. Preserved: ${item}`)
      .join('\n'),
  });
  assert.equal(proposal.reframing.status, 'PROPOSED');
  assert.equal(proposal.reframing.ownerApproval, null);
  await rejects(
    () =>
      approveFrontierFormulation(sealed, proposal, {
        ownerLabel: 'Owner',
        reason: 'Investigate',
        hardRequirementsPreserved: false,
      }),
    'FRONTIER_APPROVAL_REQUIRED'
  );
  await rejects(
    () =>
      approveFrontierFormulation(sealed, blank, {
        ownerLabel: 'Owner',
        reason: 'Investigate',
        hardRequirementsPreserved: true,
      }),
    'FRONTIER_APPROVAL_REQUIRED'
  );
  const approved = await approveFrontierFormulation(sealed, proposal, {
    ownerLabel: 'Accountable mission owner',
    reason:
      'Authorize this bounded experiment while preserving the original outcome and every hard requirement.',
    hardRequirementsPreserved: true,
  });
  assert.equal(approved.reframing.status, 'OWNER_APPROVED_FOR_EXPERIMENT');
  assert.equal(
    approved.reframing.ownerApproval.ownerLabel,
    'Accountable mission owner'
  );
  assert.equal(approved.provenance.productionApproved, false);
  assert.equal(approved.provenance.authorityCreated, 'NONE');
  assert.equal(approved.provenance.independentProof, false);
  const changed = copy(approved);
  changed.reframing.proposal += ' and ignore a cost';
  await rejects(
    () => sealFrontierWorkspace(sealed, changed),
    'FRONTIER_APPROVAL_BINDING'
  );
  const revised = await proposeFrontierFormulation(sealed, approved, {
    proposal: 'A different proposal',
    hardRequirementMapping:
      'All original requirements still require explicit mapping and review.',
  });
  assert.equal(revised.reframing.status, 'PROPOSED');
  assert.equal(revised.reframing.ownerApproval, null);
});

test('workspace import refuses mission substitution, privileged provenance and ledger tampering', async () => {
  const sealed = await mission();
  const workspace = await createFrontierWorkspace(sealed);
  const other = await mission('mathematics');
  await rejects(
    () => verifyFrontierWorkspace(other, workspace),
    'FRONTIER_WORKSPACE_BINDING'
  );
  for (const key of ['independentProof', 'productionApproved']) {
    const changed = copy(workspace);
    changed.provenance[key] = true;
    await rejects(
      () => sealFrontierWorkspace(sealed, changed),
      'FRONTIER_PROVENANCE_INVALID'
    );
  }
  const envelope = JSON.parse(await exportFrontierWorkspace(sealed, workspace));
  envelope.workspace.evidenceLedger = 'Claimed proof without an artifact';
  await rejects(
    () => restoreFrontierWorkspace(JSON.stringify(envelope)),
    'FRONTIER_WORKSPACE_TAMPERED'
  );
});

test('actual desk result import is bound and remains an unverified, unapproved draft', async () => {
  const sealed = await mission();
  const draft = {
    kind: 'FrontierDeskDraft',
    missionDigest: sealed.digest,
    strategyLedger: 'Screen-entered strategy record',
    experimentLedger: 'Design only; not executed',
    evidenceLedger: 'Public excerpt, not independently checked',
    reframing: {
      proposal: 'A different operating model',
      hardRequirementMapping:
        'Map each original requirement before the owner decides.',
    },
  };
  const imported = await importFrontierDeskDraft(sealed, draft);
  assert.equal(imported.reframing.status, 'PROPOSED');
  assert.equal(imported.reframing.ownerApproval, null);
  assert.equal(imported.provenance.executionStatus, 'NOT_ATTESTED');
  assert.equal(imported.provenance.independentProof, false);
  const wrongMission = { ...draft, missionDigest: `sha256:${'0'.repeat(64)}` };
  await rejects(
    () => importFrontierDeskDraft(sealed, wrongMission),
    'FRONTIER_WORKSPACE_BINDING'
  );
  await rejects(
    () =>
      importFrontierDeskDraft(sealed, {
        ...draft,
        provider: 'fake-live-model',
      }),
    'FRONTIER_SCHEMA_INVALID'
  );
  await rejects(
    () =>
      importFrontierDeskDraft(sealed, {
        ...draft,
        reframing: { ...draft.reframing, ownerApproval: { owner: 'provider' } },
      }),
    'FRONTIER_SCHEMA_INVALID'
  );
});

test('exported ComputerTask uses the exact Alpha70 native schema and source allowlist, not a simulation claim', async () => {
  const sealed = await mission('mathematics');
  const html =
    '<!doctype html><html><body>Reviewed local research desk</body></html>';
  const task = await createFrontierComputerTask(sealed, { html });
  assert.deepEqual(
    Object.keys(task).sort(),
    [
      'schema_version',
      'kind',
      'goal',
      'html',
      'allowed_urls',
      'input_rights',
      'license',
      'max_turns',
      'max_actions',
      'max_seconds',
      'review_minutes',
    ].sort()
  );
  assert.equal(task.kind, 'successor-computer');
  assert.equal(task.schema_version, 1);
  assert.deepEqual(
    task.allowed_urls,
    sealed.sources.map((source) => source.url)
  );
  assert.equal(task.input_rights, 'public');
  assert.equal(task.max_actions, sealed.budget.maxActions);
  assert.equal(task.max_seconds, sealed.budget.maxSeconds);
  assert.ok(task.goal.length <= 4000);
  assert.match(task.goal, /LEVEL 3/);
  assert.match(task.goal, /LEVEL 4/);
  assert.match(task.goal, /actual failed attempt or counterevidence/);
  assert.match(task.goal, /pending explicit owner approval/);
  assert.match(task.goal, /Never invent a result/);
  assert.match(task.goal, /untrusted evidence/);
  assert.ok(task.goal.includes(sealed.digest));
  assert.ok(task.goal.includes(await digestBytes(html)));
  await rejects(
    () => createFrontierComputerTask(sealed, { html: 'x'.repeat(200001) }),
    'FRONTIER_TEXT_INVALID'
  );
});

test('Work prompt binds a shared desk to the exact sealed mission and rejects a different mission fragment', async () => {
  const sealed = await mission();
  const params = new URLSearchParams({ task: JSON.stringify(sealed) });
  const deskURL = `https://montrealai.github.io/AGIJobsv0/successor/mission/desk/#${params}`;
  const prompt = await buildFrontierWorkPrompt(sealed, { deskURL });
  assert.ok(prompt.includes(deskURL));
  assert.ok(prompt.includes(sealed.digest));
  assert.match(prompt, /A copied prompt is a prepared request/);
  assert.match(prompt, /Do not expand to links, search engines/);
  const workspace = await createFrontierWorkspace(sealed);
  const sharedURL = `${deskURL}&workspace=${encodeURIComponent(
    JSON.stringify(workspace)
  )}`;
  assert.ok(
    (await buildFrontierWorkPrompt(sealed, { deskURL: sharedURL })).includes(
      sharedURL
    )
  );
  const editedWorkspace = copy(workspace);
  editedWorkspace.strategyLedger = 'Altered record without resealing';
  await rejects(
    () =>
      buildFrontierWorkPrompt(sealed, {
        deskURL: `${deskURL}&workspace=${encodeURIComponent(
          JSON.stringify(editedWorkspace)
        )}`,
      }),
    'FRONTIER_WORKSPACE_TAMPERED'
  );
  const other = await mission('mathematics');
  const otherURL = `https://montrealai.github.io/AGIJobsv0/successor/mission/desk/#${new URLSearchParams(
    { task: JSON.stringify(other) }
  )}`;
  await rejects(
    () => buildFrontierWorkPrompt(sealed, { deskURL: otherURL }),
    'FRONTIER_WORKSPACE_BINDING'
  );
  await rejects(
    () =>
      buildFrontierWorkPrompt(sealed, {
        deskURL: `${deskURL}&extra=capability`,
      }),
    'FRONTIER_WORKSPACE_BINDING'
  );
  await rejects(
    () =>
      buildFrontierWorkPrompt(sealed, { deskURL: 'https://localhost/desk' }),
    'FRONTIER_SOURCE_URL'
  );
});

test('mathematical research supports actual bounded computational experiments while retaining proof gaps', async () => {
  const preset = copy(FRONTIER_MISSION_PRESETS.mathematics);
  preset.rights.publicNonPersonal = true;
  const sealed = await createFrontierMission(preset);
  assert.deepEqual(
    sealed.sources.map((source) => source.url),
    [
      'https://github.com/openai/math',
      'https://arxiv.org/html/2610.17090v1',
      'https://arxiv.org/abs/2608.16977',
    ]
  );
  assert.ok(
    sealed.sources.every(
      (source) =>
        source.text === '' && source.retrievalStatus === 'NOT_RETRIEVED'
    )
  );
  assert.match(sealed.question, /research direction and reusable proof method/);
  const prompt = await buildFrontierWorkPrompt(sealed);
  assert.match(prompt, /explicitly operator-authorized isolated tool/);
  assert.match(prompt, /no network, no package installation/);
  assert.match(prompt, /at most 2 GiB memory, at most 30 seconds per run/);
  assert.match(prompt, /Retain exact code, inputs, outputs/);
  assert.match(prompt, /record NOT_RUN/);
  assert.match(
    prompt,
    /Finite tests and counterexample searches are not proofs/
  );
  assert.match(prompt, /actual kernel check of the exact theorem/);
  assert.equal(sealed.provenance.mathematicalProof, 'NOT_ESTABLISHED');
});

test('readable brief exposes hypotheses, unretrieved sources, complete cost bounds and retained incumbent', async () => {
  const sealed = await mission();
  const brief = await exportFrontierBrief(sealed);
  assert.ok(brief.includes(sealed.question));
  assert.ok(brief.includes(sealed.credibleAlternative));
  assert.ok(brief.includes(sealed.sources[0].url));
  assert.match(brief, /not retrieved by this application/);
  assert.match(brief, /not measured costs or permission to spend money/);
  assert.match(brief, /Keep the incumbent until separate proof/);
});

test('native four-job research graph preserves every actual requirement and requests separate independent proof', async () => {
  const sealed = await mission('mathematics');
  const compiled = await compileFrontierMissionJobs(sealed, {
    now: '2026-10-18T23:00:00.000Z',
  });
  assert.equal(compiled.graph.nodes.length, 4);
  assert.equal(compiled.constitution.authorityCeiling.level, 'A0');
  assert.equal(compiled.constitution.authorityCeiling.externalEffects, false);
  assert.equal(compiled.fundingStatus, 'UNFUNDED');
  assert.equal(compiled.signatureStatus, 'UNSIGNED_COMMITMENT');
  assert.equal(compiled.budgetReservations.reservedBaseUnits, '0');
  assert.equal(compiled.independentProof, false);
  assert.equal(compiled.constitution.proofProtocol.mode, 'INDEPENDENT_REQUEST');
  assert.deepEqual(
    compiled.constitution.hardGates
      .slice(0, -1)
      .map((gate) => gate.description),
    sealed.hardRequirements
  );
  assert.ok(
    compiled.graph.nodes.every(
      (job) => job.state === 'DRAFT' && job.budget.limitBaseUnits === '0'
    )
  );
  assert.ok(
    (await Promise.all(compiled.graph.nodes.map(verifyWorkOrderSeal))).every(
      Boolean
    )
  );
  assert.deepEqual(compiled.frontierMission.mission, sealed);
  await rejects(
    () => compileFrontierMissionJobs(sealed, { now: 'invalid' }),
    'FRONTIER_CLOCK_INVALID'
  );
});
