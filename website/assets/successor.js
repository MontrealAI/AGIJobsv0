import { successorCopy } from './successor-copy.mjs';
import {
  runMissionJourney,
  createWorkbenchMission,
} from '../../packages/successor-core/src/journeys.mjs';
import {
  createRehearsalState,
  invalidateRehearsal,
  recordRehearsalRun,
  freezeRehearsal,
  reviewRehearsal,
  impairRehearsal,
} from '../../packages/successor-core/src/presentation-state.mjs';
import {
  createMissionPack,
  restoreMissionPack,
  createSuccessor,
} from '../../packages/successor-core/src/pack.mjs';

const root = document.querySelector('[data-successor]');
if (root) {
  const t = successorCopy[root.dataset.language] || successorCopy.en;
  const get = (name) => document.getElementById('omega-' + name);
  let state = createRehearsalState('invoice', root.dataset.revision);
  let restored = null,
    descendant = null,
    busy = false,
    operation = 0;
  const json = (value) => JSON.stringify(value ?? null, null, 2);
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function notify(text, error = false) {
    get('status').textContent = text;
    get('status').dataset.error = String(error);
  }
  function failure(error) {
    notify(
      `${error?.code || 'UI_OPERATION_FAILED'} — ${t.error} ${
        error?.message || ''
      }`,
      true
    );
  }
  function list(values, ordered = false) {
    const node = element(ordered ? 'ol' : 'ul');
    for (const value of values) node.append(element('li', value));
    return node;
  }
  function code(value) {
    const node = element('pre', json(value));
    node.tabIndex = 0;
    node.setAttribute('aria-label', t.exact);
    return node;
  }
  function table(headers, rows) {
    const wrap = element('div', undefined, 'omega-table-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', t.comparison);
    const node = element('table'),
      head = element('thead'),
      row = element('tr');
    for (const title of headers) {
      const th = element('th', title);
      th.scope = 'col';
      row.append(th);
    }
    head.append(row);
    node.append(head);
    const body = element('tbody');
    for (const values of rows) {
      const r = element('tr');
      for (const value of values) r.append(element('td', String(value)));
      body.append(r);
    }
    node.append(body);
    wrap.append(node);
    return wrap;
  }
  function clearReports() {
    for (const name of ['world', 'policy', 'jobs', 'comparison'])
      get(name + '-content').replaceChildren(element('p', t.report));
    get('report-json').textContent = '{}';
  }
  function showReport() {
    clearReports();
    const journey = state.report;
    if (!journey) return;
    const r = journey.workbench || journey;
    get('report-json').textContent = json(journey);
    get('constitution-json').textContent = json(journey.mission);
    const world = get('world-content'),
      policy = get('policy-content'),
      jobs = get('jobs-content'),
      comparison = get('comparison-content');
    if (state.mission === 'invoice') {
      const d = r.dossier;
      const findings = {
        'amount-exceeds-po': 'findingAmount',
        'scope-mismatch': 'findingScope',
        'possible-duplicate': 'findingDuplicate',
        'bank-change-unconfirmed': 'findingBank',
        'completion-incomplete': 'findingCompletion',
        'warranty-review': 'findingWarranty',
      };
      world.replaceChildren(
        list(
          (d.findings || []).map(
            (f) =>
              `${t[findings[f.id]] || f.summary} ${
                f.status === 'ESTABLISHED' ? t.established : t.unresolved
              } · ${f.sourceIds?.join(', ') || ''}`
          )
        ),
        code({
          uncertainty: d.uncertainty,
          sourceCount: d.metrics?.sourceCount,
        })
      );
      policy.replaceChildren(
        element('p', d.recommendation, 'omega-recommendation'),
        element('p', t.invoiceOutcome),
        code({
          requiredHumanDecision: d.requiredHumanDecision,
          prohibitedActions: d.prohibitedActions,
        })
      );
      const work = r.graph?.nodes || [];
      jobs.replaceChildren(
        list(
          work.map(
            (job) =>
              `${job.jobId} · ${job.objective || job.title || job.family || ''}`
          ),
          true
        )
      );
      comparison.replaceChildren(
        element('p', r.status, 'omega-recommendation'),
        code({
          metrics: d.metrics,
          nextDecision: r.nextDecision,
          acceptance: 'NOT_RECORDED',
          independentEvidence: 'UNAVAILABLE',
        })
      );
    } else if (state.mission === 'world') {
      const selected = r.candidates.find((c) => c.id === r.selectedCandidateId);
      world.replaceChildren(
        code({
          selected: selected?.program,
          counterexamples: r.counterexamples,
        })
      );
      policy.replaceChildren(
        code({
          selectedCandidateId: r.selectedCandidateId,
          policy: selected?.policy,
          strongestComparatorId: r.strongestComparatorId,
        })
      );
      jobs.replaceChildren(
        list(
          journey.compilation.graph.nodes.map(
            (job) => `${job.jobId} · ${job.family}`
          ),
          true
        ),
        code({
          coverage: journey.compilation.coverage,
          search: r.search,
          chronicleEvents: r.chronicleEvents,
          status: 'PLANNED_NOT_ACCEPTED',
        })
      );
      comparison.replaceChildren(
        table(
          [t.name, t.correct, t.critical, t.eligible],
          r.candidates.map((c) => [
            c.name || c.id,
            `${c.metrics.correct} / ${c.metrics.cases}`,
            c.metrics.criticalMisses,
            c.eligible ? t.pass : t.fail,
          ])
        ),
        element('p', t.noAdvantage),
        code(r.alpha)
      );
    } else {
      world.replaceChildren(
        code({ correlation: r.correlation, resourcePlan: r.resourcePlan })
      );
      policy.replaceChildren(
        code({ nominal: r.nominal.policy, stress: r.stress.policy })
      );
      jobs.replaceChildren(
        list(
          journey.compilation.graph.nodes.map(
            (job) => `${job.jobId} · ${job.family}`
          ),
          true
        ),
        code({
          coverage: journey.compilation.coverage,
          nominalStatesVisited: r.nominal.statesVisited,
          expectedTestCost: r.nominal.expectedTestCost,
          status: 'PLANNED_NOT_ACCEPTED',
        })
      );
      comparison.replaceChildren(
        table(
          [t.name, t.utility],
          [
            [t.planner, r.nominal.expectedUtility],
            [t.shift, r.stress.expectedUtility],
            ...r.comparators.map((c) => [c.name || c.id, c.expectedUtility]),
          ]
        ),
        element('p', t.noAdvantage),
        code(r.alpha)
      );
    }
  }
  function paint() {
    root.dataset.stage = state.stage;
    get('run').disabled = busy;
    get('stop').disabled = !busy && state.stage === 'DRAFT';
    get('freeze').disabled =
      busy ||
      !state.report ||
      Boolean(state.frozen) ||
      state.stage === 'IMPAIRED';
    get('review').disabled = busy || !state.frozen;
    get('impair').disabled = busy || !state.frozen;
    get('export').disabled =
      busy || !state.report || state.stage === 'IMPAIRED';
    get('descendant').disabled = busy || !restored;
    get('state-candidate').textContent = state.frozen
      ? t.frozenCandidate
      : t.noCandidate;
    get('state-proof').textContent = t.absent;
    get('state-authority').textContent = t.noAuthority;
    get('state-advantage').textContent =
      state.advantage === 'INVALIDATED'
        ? 'INVALIDATED · ' + t.noAdvantage
        : t.noAdvantage;
    get('state-next').textContent = state.report ? t.nextReview : t.nextDefault;
    const report = state.report?.workbench || state.report;
    get('state-budget').textContent = report?.search
      ? `${report.search.evaluated} / ${report.search.budget.maxCandidates} ${t.candidateUnits}`
      : report?.dossier?.metrics
      ? `${report.dossier.metrics.costBaseUnits} ${
          report.dossier.metrics.costUnit
        } · ${report.dossier.metrics.humanMinutes ?? t.humanUnknown}`
      : report?.nominal
      ? `${Number(report.nominal.expectedTestCost).toFixed(2)} ${
          t.utilityUnits
        }`
      : '—';
    get('freeze-json').textContent = json({
      frozen: state.frozen,
      simulatedReview: state.review,
      activeAuthority: state.authority,
      proofCurrency: state.proofCurrency,
    });
    get('pack-json').textContent = restored
      ? json({ restored, descendant })
      : '{}';
    const events = state.events;
    get('events').replaceChildren(
      ...(events.length
        ? events.map((event) => element('li', json(event)))
        : [element('li', t.noEvents)])
    );
  }
  function changeMission(mission) {
    operation++;
    busy = false;
    const old = invalidateRehearsal(state, 'MISSION_OR_ASSUMPTION_CHANGED');
    state = {
      ...createRehearsalState(mission, root.dataset.revision),
      generation: old.generation,
      events: old.events,
    };
    restored = null;
    descendant = null;
    get('restore').value = '';
    get('select').value = mission;
    get('probability-field').hidden = mission !== 'resources';
    get('outcome').textContent = t[mission + 'Outcome'];
    get('alternative').textContent = t[mission + 'Alternative'];
    for (const button of root.querySelectorAll('[data-omega-mission]'))
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.omegaMission === mission)
      );
    get('constitution-json').textContent = json(
      createWorkbenchMission(mission)
    );
    clearReports();
    paint();
    notify(t.ready);
  }
  for (const button of root.querySelectorAll('[data-omega-mission]'))
    button.addEventListener('click', () =>
      changeMission(button.dataset.omegaMission)
    );
  get('select').addEventListener('change', () =>
    changeMission(get('select').value)
  );
  get('probability').addEventListener('input', () =>
    changeMission(state.mission)
  );
  get('stop').addEventListener('click', () => {
    changeMission(state.mission);
    notify(t.stoppedMessage);
  });
  get('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = ++operation;
    state = invalidateRehearsal(state, 'NEW_RUN');
    restored = null;
    descendant = null;
    busy = true;
    clearReports();
    paint();
    notify(t.busy);
    try {
      const generation = state.generation,
        mission = state.mission;
      const probability = Number(get('probability').value);
      if (
        mission === 'resources' &&
        (!Number.isFinite(probability) ||
          probability < 0.05 ||
          probability > 0.95)
      )
        throw Object.assign(new Error(t.probabilityHelp), {
          code: 'UI_PROBABILITY_RANGE',
        });
      // Yield once for the busy state; all computation is finite local core work.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const report = await runMissionJourney(
        mission,
        mission === 'resources'
          ? {
              goodProbability: probability,
              stressGoodProbability: Math.max(0.01, probability - 0.2),
            }
          : {}
      );
      if (token !== operation) return;
      state = recordRehearsalRun(state, report, generation);
      showReport();
      notify(t.completed);
    } catch (error) {
      if (token === operation) failure(error);
    } finally {
      if (token === operation) {
        busy = false;
        paint();
      }
    }
  });
  get('freeze').addEventListener('click', async () => {
    const token = ++operation;
    busy = true;
    paint();
    try {
      const next = await freezeRehearsal(state);
      if (token !== operation) return;
      state = next;
      notify(t.frozen);
    } catch (error) {
      if (token === operation) failure(error);
    } finally {
      if (token === operation) {
        busy = false;
        paint();
      }
    }
  });
  get('review').addEventListener('click', () => {
    try {
      state = reviewRehearsal(state);
      paint();
      notify(t.reviewed);
    } catch (error) {
      failure(error);
    }
  });
  get('impair').addEventListener('click', () => {
    try {
      operation++;
      state = impairRehearsal(state);
      paint();
      notify(t.impaired);
    } catch (error) {
      failure(error);
    }
  });
  get('export').addEventListener('click', async () => {
    const token = ++operation;
    busy = true;
    paint();
    try {
      const report = state.report;
      const artifact = (path, kind, content) => ({
        path,
        kind,
        rights: 'owned',
        license: 'MIT code / CC0-1.0 authored synthetic fixture',
        content,
      });
      const artifacts = [
        artifact('knowledge/report.json', 'knowledge', report),
        artifact(
          'knowledge/failures.json',
          'negative-knowledge',
          report.workbench?.counterexamples ||
            report.dossier?.findings ||
            report.workbench?.alpha
        ),
        artifact('replay/recipe.json', 'replay-recipe', {
          mission: state.mission,
          revision: state.revision,
          goodProbability: Number(get('probability').value),
          command: 'npm run successor:demo',
          mode: 'SYNTHETIC_REHEARSAL',
        }),
      ];
      artifacts.push(
        artifact('constitution.json', 'constitution', report.mission),
        artifact('jobs/sealed-graph.json', 'jobs', report.compilation)
      );
      if (state.frozen)
        artifacts.push(
          artifact('candidate/preview.json', 'candidate', state.frozen)
        );
      if (state.review)
        artifacts.push(
          artifact(
            'history/simulated-review.json',
            'proof-history',
            state.review
          )
        );
      const pack = await createMissionPack({
        institutionId: report.mission.institutionId,
        missionId: report.mission.missionId,
        artifacts,
        chronicle: state.events,
        exclusions: [
          'Credentials',
          'Protected evaluation data',
          'Active permissions',
          'Production connections',
        ],
      });
      if (token !== operation) return;
      const href = URL.createObjectURL(
          new Blob([json(pack) + '\n'], { type: 'application/json' })
        ),
        a = document.createElement('a');
      a.href = href;
      a.download = `successor-${state.mission}-mission-pack.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (error) {
      if (token === operation) failure(error);
    } finally {
      if (token === operation) {
        busy = false;
        paint();
      }
    }
  });
  get('restore').addEventListener('change', async () => {
    const token = ++operation;
    busy = true;
    restored = null;
    descendant = null;
    state = invalidateRehearsal(state, 'PACK_IMPORT_ATTEMPT');
    clearReports();
    paint();
    try {
      const file = get('restore').files?.[0];
      if (
        !file ||
        file.size > 2 * 1024 * 1024 ||
        !file.name.toLowerCase().endsWith('.json')
      )
        throw Object.assign(new Error(t.invalidFile), {
          code: 'PACK_INPUT_INVALID',
        });
      const input = JSON.parse(await file.text());
      const next = await restoreMissionPack(input);
      if (token !== operation) return;
      // Imported knowledge never becomes a current run, a frozen candidate or a permission.
      state = invalidateRehearsal(state, 'PACK_RESTORED_REQUIRES_REEVALUATION');
      restored = next;
      clearReports();
      notify(t.restored);
    } catch (error) {
      if (token === operation) failure(error);
    } finally {
      if (token === operation) {
        busy = false;
        paint();
      }
    }
  });
  get('descendant').addEventListener('click', async () => {
    const token = ++operation;
    busy = true;
    paint();
    try {
      const next = await createSuccessor(restored, {
        id: `${restored.missionId}-replacement`,
        supplier: 'conventional-local-replacement',
      });
      if (token !== operation) return;
      descendant = next;
      notify(t.descended);
    } catch (error) {
      if (token === operation) failure(error);
    } finally {
      if (token === operation) {
        busy = false;
        paint();
      }
    }
  });
  get('constitution-json').textContent = json(
    createWorkbenchMission(state.mission)
  );
  paint();
  root.dataset.ready = 'true';
}
