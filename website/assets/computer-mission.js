import { computerMissionCopy } from './computer-mission-copy.mjs';
import {
  computerDeskConfiguration,
  initComputerDesk,
  renderComputerDeskDocument,
} from './computer-desk.mjs';
import {
  createComputerMission,
  runComputerMission,
  exportComputerMissionReport,
  restoreComputerMissionReport,
  reviewObservedAllocation,
  createAlphaComputerTask,
  compileComputerMissionJobs,
} from '../../packages/successor-core/src/computer-mission.mjs';

const publicDesk = document.querySelector('[data-computer-desk-page]');
if (publicDesk) {
  const language = publicDesk.dataset.language === 'fr' ? 'fr' : 'en';
  const desk = publicDesk.querySelector('[data-computer-desk]');
  try {
    let mission = await createComputerMission(),
      options = { language, formulation: 'actual_requirements' };
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get(
      'task'
    );
    if (fragment) {
      if (fragment.length > 16000)
        throw new Error('The public task fragment exceeds its bounded size.');
      const supplied = JSON.parse(fragment);
      if (
        !supplied ||
        Object.keys(supplied).some(
          (key) =>
            ![
              'mission',
              'formulation',
              'reportDigest',
              'frozenProgramDigest',
            ].includes(key)
        ) ||
        !['actual_requirements', 'all_early'].includes(supplied.formulation)
      )
        throw new Error('Unsupported public desk task.');
      for (const key of ['reportDigest', 'frozenProgramDigest'])
        if (supplied[key] && !/^sha256:[a-f0-9]{64}$/.test(supplied[key]))
          throw new Error('Invalid task binding.');
      await runComputerMission(
        supplied.mission,
        supplied.formulation === 'actual_requirements'
          ? {
              formulationApproval: {
                approved: true,
                ownerLabel: 'public-link-claim',
                reason:
                  'Public task parameters request this local comparison; this is not authenticated owner identity or execution permission.',
              },
            }
          : {}
      );
      mission = supplied.mission;
      options = {
        language,
        formulation: supplied.formulation,
        ...(supplied.reportDigest
          ? { reportDigest: supplied.reportDigest }
          : {}),
        ...(supplied.frozenProgramDigest
          ? { frozenProgramDigest: supplied.frozenProgramDigest }
          : {}),
      };
    }
    initComputerDesk(desk, computerDeskConfiguration(mission, options));
    publicDesk.dataset.ready = 'true';
  } catch (error) {
    desk.querySelector('#cm-desk-review').textContent = error.message;
    desk.querySelector('#cm-desk-evaluate').disabled = true;
    publicDesk.dataset.error = 'true';
  }
}

const root = document.querySelector('[data-computer-mission]');
if (root) {
  const language = root.dataset.language === 'fr' ? 'fr' : 'en',
    t = computerMissionCopy[language];
  const $ = (id) => document.getElementById(`cm-${id}`);
  const json = (value) => JSON.stringify(value ?? null, null, 2);
  const money = (cents) =>
    Number.isFinite(cents)
      ? new Intl.NumberFormat(language, {
          style: 'currency',
          currency: 'USD',
        }).format(cents / 100)
      : '—';
  const element = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  let report = null,
    snapshot = '',
    busy = false,
    observed = null,
    observedReview = null,
    observationPending = false,
    observationGeneration = 0,
    scriptedDeskInteraction = false,
    importedEvidence = null,
    jobs = null,
    initialMission = null;
  const desk = $('desk-host').querySelector('[data-computer-desk]');
  function readInputs() {
    const amount = $('budget').value.trim();
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(amount))
      throw new Error(
        language === 'fr'
          ? 'Saisissez un budget en dollars avec au plus deux décimales.'
          : 'Enter the dollar budget with at most two decimal places.'
      );
    const [whole, fraction = ''] = amount.split('.');
    return {
      earlyUnits: Number($('early-units').value),
      earlyDay: Number($('early-day').value),
      totalUnits: Number($('total-units').value),
      finalDay: Number($('final-day').value),
      budgetCents: Number(whole) * 100 + Number(fraction.padEnd(2, '0')),
    };
  }
  function inputsChanged() {
    if (!report) return false;
    try {
      return snapshot !== json(readInputs());
    } catch {
      return true;
    }
  }
  function notify(text, error = false) {
    $('status').textContent = text;
    $('status').dataset.error = String(error);
  }
  function sync() {
    const stale = inputsChanged(),
      eligible = Boolean(report?.frozen.plan);
    root.setAttribute('aria-busy', String(busy));
    $('edited').hidden = !stale;
    for (const id of ['practice', 'run', 'hard-early', 'restore'])
      $(id).disabled = busy;
    $('copy-work').disabled = busy || !initialMission || stale;
    $('reframe').disabled = busy || !report || stale;
    for (const id of ['task', 'desk-download', 'run-desk'])
      $(id).disabled = busy || !eligible || stale;
    $('evidence-input').disabled = busy || !eligible || stale;
    for (const id of ['export', 'readable']) $(id).disabled = busy || !report;
    $('evidence-export').disabled =
      busy || observationPending || (!observed && !importedEvidence);
    $('jobs').disabled = busy || !report || stale;
    $('jobs-download').disabled = busy || !jobs || stale;
    for (const input of desk.querySelectorAll('input,button'))
      input.disabled = (busy && !scriptedDeskInteraction) || !report || stale;
  }
  async function action(work) {
    if (busy) return;
    busy = true;
    sync();
    try {
      await work();
    } catch (error) {
      notify(`${t.error} ${error?.message || ''}`, true);
      $('status').focus();
    } finally {
      busy = false;
      sync();
    }
  }
  const scrollTo = (id) =>
    $(id).scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  function clearExecution() {
    observationGeneration++;
    observationPending = false;
    observed = null;
    observedReview = null;
    importedEvidence = null;
    jobs = null;
    $('observed-json').textContent = '{}';
    $('import-review').textContent = '{}';
    $('evidence-status').textContent = '';
    $('observed-status').textContent = '';
    $('provider-state').textContent = t.notRun;
    $('jobs-result').hidden = true;
  }
  function publicTaskURL(current = report) {
    const url = new URL(
      `${root.dataset.base}successor/computer/desk/${
        language === 'fr' ? 'fr/' : ''
      }`,
      window.location.origin
    );
    if (current)
      url.hash = new URLSearchParams({
        task: JSON.stringify({
          mission: current.mission,
          formulation: current.formulation,
          reportDigest: current.digest,
          frozenProgramDigest: current.frozen.programDigest,
        }),
      }).toString();
    return url.href;
  }
  function updateWorkPrompt() {
    const current = report,
      mission = current?.mission || initialMission;
    if (!mission) return;
    const r = mission.requirements;
    const quantities = current?.frozen.plan?.allocations
      .map((a) => `${a.supplierId}: ${a.units}`)
      .join('; ');
    const url = publicTaskURL(current);
    $('public-desk').href = url;
    const lines =
      language === 'fr'
        ? [
            'Utilisez Computer Use avec le clavier, la souris et les captures d’écran pour travailler dans ce bureau public :',
            url,
            `Exigences réelles : ${r.earlyUnits} unités au plus tard au jour ${
              r.earlyDay
            }; ${r.totalUnits} au total au jour ${
              r.finalDay
            }; budget maximal ${money(r.budgetCents)}.`,
            current?.formulation === 'all_early'
              ? 'Conservez aussi l’hypothèse actuelle : un seul fournisseur et toutes les unités avant le premier délai.'
              : 'Les livraisons échelonnées sont permises sans modifier aucune exigence réelle.',
            quantities
              ? `Saisissez la répartition figée : ${quantities}.`
              : 'Lisez les conditions visibles et proposez une répartition réalisable au coût le plus bas.',
            'Activez « Vérifier mon plan ». Laissez le résultat visible et conservez les captures et actions réellement produites. Exportez le bloc JSON visible commençant par SUCCESSOR_COMPUTER_RESULT. Ne faites aucun achat, connexion, envoi de message ou téléversement. Ne supposez pas que le contrôle arithmétique prouve la qualité du modèle.',
          ]
        : [
            'Use Computer Use with keyboard, mouse and screenshots to work in this public supplier desk:',
            url,
            `Actual requirements: ${r.earlyUnits} units by day ${r.earlyDay}; ${
              r.totalUnits
            } total by day ${r.finalDay}; maximum budget ${money(
              r.budgetCents
            )}.`,
            current?.formulation === 'all_early'
              ? 'Also preserve the current assumption: one supplier and all units by the early deadline.'
              : 'Staged delivery is permitted without changing any actual requirement.',
            quantities
              ? `Enter this frozen allocation: ${quantities}.`
              : 'Read the visible source terms and propose the lowest-cost feasible allocation.',
            'Activate “Check my plan”. Leave the result visible and preserve the screenshots and actions you actually produced. Export the visible JSON block beginning SUCCESSOR_COMPUTER_RESULT. Do not purchase, log in, send messages or upload. Do not treat an arithmetic check as proof of model quality.',
          ];
    if (current)
      lines.push(
        `Mission: ${current.mission.digest}`,
        `Report: ${current.digest}`,
        `Frozen program: ${current.frozen.programDigest}`
      );
    $('work-prompt').value = lines.join('\n\n');
  }
  function metric(container, value, label) {
    const item = element('div', undefined, 'cm-metric');
    item.append(element('strong', value), element('span', label));
    container.append(item);
  }
  function render() {
    $('results').hidden = !report;
    $('no-report').hidden = Boolean(report);
    $('report-json').textContent = report ? json(report) : '{}';
    $('task-state').textContent = report?.frozen.plan
      ? `${report.digest.slice(0, 26)}… · ${t.selection}`
      : t.noTask;
    if (!report) {
      updateWorkPrompt();
      sync();
      return;
    }
    const d = report.development;
    $('costs').replaceChildren();
    metric($('costs'), money(d.baseline.costCents), t.incumbent);
    metric($('costs'), money(d.selected?.costCents), t.nominee);
    metric($('costs'), money(d.credibleAlternative.costCents), t.credible);
    metric(
      $('costs'),
      money(report.decision.quotedCostDifferenceFromIncumbentCents),
      t.difference
    );
    $('study-counts').replaceChildren();
    for (const [value, label] of [
      [d.attempts.length, t.attempts],
      [
        d.attempts.filter((a) => a.lineage.kind === 'FAILURE_DRIVEN_REVISION')
          .length,
        t.revisions,
      ],
      [report.confirmation.cases.length, t.fresh],
    ]) {
      const item = element('p');
      item.append(
        element('strong', String(value)),
        document.createTextNode(` ${label}`)
      );
      $('study-counts').append(item);
    }
    $('attempts').replaceChildren();
    $('revisions').replaceChildren();
    for (const attempt of d.attempts) {
      const row = element('tr');
      const program = `${attempt.program.allocation.op} / ${attempt.program.objective.costModel}`;
      row.append(
        element('td', attempt.attemptId),
        element('td', program),
        element('td', attempt.check?.valid ? t.pass : t.fail),
        element('td', money(attempt.costCents)),
        element('td', attempt.lineage.parentAttemptId || '—')
      );
      row.dataset.valid = String(Boolean(attempt.check?.valid));
      $('attempts').append(row);
      if (attempt.lineage.kind === 'FAILURE_DRIVEN_REVISION') {
        const item = element('li');
        item.append(
          element(
            'strong',
            `${attempt.lineage.parentAttemptId} → ${attempt.attemptId}`
          ),
          element('p', attempt.lineage.reason)
        );
        $('revisions').append(item);
      }
    }
    $('development-json').textContent = json(d);
    $('frozen-json').textContent = json(report.frozen);
    $('fresh-cases').replaceChildren();
    for (const item of report.confirmation.cases) {
      const card = element('article', undefined, 'cm-card');
      card.append(
        element('h3', item.caseId),
        element(
          'p',
          `${t.nominee}: ${money(item.candidate?.costCents)} · ${
            t.incumbent
          }: ${money(item.incumbent.costCents)} · ${t.credible}: ${money(
            item.credibleAlternative.costCents
          )}`
        ),
        element('p', t.limits, 'cm-help')
      );
      $('fresh-cases').append(card);
    }
    $('requirements').replaceChildren();
    const r = report.mission.requirements;
    for (const [label, value] of [
      [t.earlyUnits, `${r.earlyUnits} / ${r.earlyDay}`],
      [t.totalUnits, `${r.totalUnits} / ${r.finalDay}`],
      [t.budget, money(r.budgetCents)],
    ]) {
      const pair = element('div');
      pair.append(element('dt', label), element('dd', value));
      $('requirements').append(pair);
    }
    $('hard-case').hidden = !report.reframing.hardEarlyRequirement;
    $('history').replaceChildren();
    for (const event of report.history)
      $('history').append(
        element(
          'li',
          `${event.sequence}. ${event.type} · ${event.digest.slice(0, 23)}…`
        )
      );
    initComputerDesk(
      desk,
      computerDeskConfiguration(report.mission, {
        language,
        formulation: report.formulation,
        reportDigest: report.digest,
        frozenProgramDigest: report.frozen.programDigest,
      })
    );
    updateWorkPrompt();
    sync();
  }
  async function study({ approval, practice = false } = {}) {
    if (!$('form').reportValidity()) return;
    notify(t.running);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const requirements = readInputs(),
      mission = await createComputerMission({ requirements });
    const generated = await runComputerMission(
      mission,
      approval ? { formulationApproval: approval } : {}
    );
    report = generated;
    snapshot = json(requirements);
    clearExecution();
    render();
    notify(approval ? t.approved : t.ready);
    if (practice && report.frozen.plan) {
      runDesk();
      scrollTo('desk-section');
    } else scrollTo('strategies');
  }
  function runDesk() {
    if (!report?.frozen.plan || inputsChanged()) return;
    scriptedDeskInteraction = true;
    try {
      for (const input of desk.querySelectorAll('input,button'))
        input.disabled = false;
      $('desk-mode').textContent = t.deskScripted;
      desk.computerDesk.fill(report.frozen.plan.allocations);
      desk.computerDesk.check();
    } finally {
      scriptedDeskInteraction = false;
    }
  }
  function download(content, filename, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = element('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function deskHTML() {
    return renderComputerDeskDocument(report.mission, {
      language,
      formulation: report.formulation,
      reportDigest: report.digest,
      frozenProgramDigest: report.frozen.programDigest,
    });
  }
  function readable() {
    return [
      report.mission.title,
      '='.repeat(55),
      t.mode,
      t.synthetic,
      '',
      t.requirementLabel,
      json(report.mission.requirements),
      '',
      `${t.incumbent}: ${money(report.development.baseline.costCents)}`,
      `${t.nominee}: ${money(report.development.selected?.costCents)}`,
      `${t.credible}: ${money(
        report.development.credibleAlternative.costCents
      )}`,
      `${t.difference}: ${money(
        report.decision.quotedCostDifferenceFromIncumbentCents
      )}`,
      '',
      t.retainTitle,
      t.retainBody,
      '',
      `${t.attempts}: ${report.development.attempts.length}`,
      `${t.revisions}: ${
        report.development.attempts.filter(
          (a) => a.lineage.kind === 'FAILURE_DRIVEN_REVISION'
        ).length
      }`,
      `${t.fresh}: ${report.confirmation.cases.length}`,
      t.limits,
      t.measurement,
      '',
      `Mission: ${report.mission.digest}`,
      `Report: ${report.digest}`,
      `Frozen program: ${report.frozen.programDigest}`,
      '',
      t.notRun,
    ].join('\n');
  }
  $('form').addEventListener('submit', (event) => {
    event.preventDefault();
    action(() => study());
  });
  $('form').addEventListener('input', sync);
  $('practice').addEventListener('click', () =>
    action(() => study({ practice: true }))
  );
  $('hard-early').addEventListener('click', () =>
    action(async () => {
      $('early-units').value = $('total-units').value;
      $('approval').checked = false;
      await study();
    })
  );
  $('reframe-form').addEventListener('submit', (event) => {
    event.preventDefault();
    action(async () => {
      if (inputsChanged()) throw new Error(t.edited);
      if (!$('reframe-form').reportValidity()) return;
      await study({
        approval: {
          approved: $('approval').checked,
          ownerLabel: $('owner').value,
          reason: $('reason').value,
        },
      });
    });
  });
  $('run-desk').addEventListener('click', runDesk);
  desk.addEventListener('input', () => {
    observationGeneration++;
    observationPending = false;
    observed = null;
    observedReview = null;
    $('observed-json').textContent = '{}';
    $('observed-status').textContent = '';
    sync();
  });
  desk.addEventListener('computer-desk-result', async (event) => {
    if (!report || inputsChanged()) return;
    const expected = report.digest;
    const generation = ++observationGeneration;
    const submittedObservation = JSON.parse(JSON.stringify(event.detail));
    observationPending = true;
    observed = null;
    observedReview = null;
    $('observed-json').textContent = json({ status: 'REVIEW_PENDING' });
    sync();
    try {
      const checked = await reviewObservedAllocation(
        report,
        submittedObservation
      );
      if (report.digest !== expected || generation !== observationGeneration)
        return;
      observed = submittedObservation;
      observedReview = checked;
      $('observed-json').textContent = json({
        observedResult: submittedObservation,
        review: checked,
        executionProvenance: 'LOCAL_PAGE_INTERACTION_NOT_AI_EXECUTION',
      });
      $('observed-status').textContent = checked.accepted
        ? t.observedReady
        : t.evidenceRejected;
    } catch (error) {
      if (report.digest !== expected || generation !== observationGeneration)
        return;
      observed = submittedObservation;
      $('observed-json').textContent = json({
        observedResult: submittedObservation,
        accepted: false,
        error: error.message,
      });
      $(
        'observed-status'
      ).textContent = `${t.evidenceRejected} ${error.message}`;
    }
    observationPending = false;
    sync();
  });
  $('copy-work').addEventListener('click', () =>
    action(async () => {
      $('work-prompt').focus();
      $('work-prompt').select();
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText($('work-prompt').value);
      notify(
        navigator.clipboard?.writeText
          ? t.copied
          : language === 'fr'
          ? 'La mission est sélectionnée. Copiez-la dans votre session Computer Use.'
          : 'The mission is selected. Copy it into your Computer Use session.'
      );
    })
  );
  $('task').addEventListener('click', () =>
    action(async () => {
      if (inputsChanged()) throw new Error(t.edited);
      const task = await createAlphaComputerTask(report, { html: deskHTML() });
      download(json(task), 'successor-computer-task.json');
    })
  );
  $('desk-download').addEventListener('click', () => {
    if (report && !inputsChanged())
      download(
        deskHTML(),
        'successor-supplier-desk.html',
        'text/html;charset=utf-8'
      );
  });
  $('export').addEventListener('click', () =>
    action(async () => {
      download(
        await exportComputerMissionReport(report),
        'successor-computer-report.json'
      );
    })
  );
  $('readable').addEventListener('click', () => {
    if (report)
      download(
        readable(),
        'successor-computer-brief.txt',
        'text/plain;charset=utf-8'
      );
  });
  $('evidence-export').addEventListener('click', () => {
    if (observationPending || (!observed && !importedEvidence)) return;
    download(
      json(
        importedEvidence || {
          schema: 'successor-local-page-observation/v1',
          observedResult: observed,
          review: observedReview,
          executionProvenance: 'LOCAL_PAGE_INTERACTION_NOT_AI_EXECUTION',
          independentProof: false,
          authorityCreated: 'NONE',
        }
      ),
      'successor-computer-observation.json'
    );
  });
  $('jobs').addEventListener('click', () =>
    action(async () => {
      if (inputsChanged()) throw new Error(t.edited);
      jobs = await compileComputerMissionJobs(report);
      $('jobs-json').textContent = json(jobs);
      $('jobs-result').hidden = false;
    })
  );
  $('jobs-download').addEventListener('click', () => {
    if (jobs && !inputsChanged())
      download(json(jobs), 'successor-computer-jobs-drafts.json');
  });
  $('restore').addEventListener('change', () => {
    const file = $('restore').files[0];
    if (!file) return;
    action(async () => {
      if (file.size > 4 * 1024 * 1024)
        throw new Error('Report file exceeds 4 MB.');
      const restored = await restoreComputerMissionReport(await file.text());
      computerDeskConfiguration(restored.mission, {
        language,
        formulation: restored.formulation,
        reportDigest: restored.digest,
        frozenProgramDigest: restored.frozen.programDigest,
      });
      report = restored;
      const r = report.mission.requirements;
      for (const [id, key] of [
        ['early-units', 'earlyUnits'],
        ['early-day', 'earlyDay'],
        ['total-units', 'totalUnits'],
        ['final-day', 'finalDay'],
      ])
        $(id).value = String(r[key]);
      $('budget').value = (r.budgetCents / 100).toFixed(2);
      snapshot = json(readInputs());
      clearExecution();
      $('owner').value = report.reframing.approval?.ownerLabel || '';
      $('reason').value = report.reframing.approval?.reason || t.reasonDefault;
      $('approval').checked = Boolean(report.reframing.approval);
      render();
      notify(t.restored);
      scrollTo('strategies');
    }).finally(() => {
      $('restore').value = '';
    });
  });
  $('evidence-input').addEventListener('change', () => {
    const file = $('evidence-input').files[0];
    if (!file) return;
    action(async () => {
      if (inputsChanged()) throw new Error(t.edited);
      if (file.size > 8 * 1024 * 1024)
        throw new Error('Evidence file exceeds 8 MB.');
      const uploaded = JSON.parse(await file.text());
      const delivered =
        uploaded.deliveredResult ||
        uploaded.observedResult ||
        uploaded.observed ||
        uploaded;
      importedEvidence = {
        imported: uploaded,
        providerProvenance: 'SELF_REPORTED_NOT_AUTHENTICATED',
        independentProof: false,
        authorityCreated: 'NONE',
      };
      try {
        const review = await reviewObservedAllocation(report, delivered);
        importedEvidence.review = review;
        $('import-review').textContent = json(importedEvidence);
        $('evidence-status').textContent = review.accepted
          ? t.evidenceChecked
          : t.evidenceRejected;
      } catch (error) {
        importedEvidence.review = {
          accepted: false,
          error: error.message,
          independentProof: false,
          authorityCreated: 'NONE',
        };
        $('import-review').textContent = json(importedEvidence);
        $(
          'evidence-status'
        ).textContent = `${t.evidenceRejected} ${error.message}`;
      }
      const claim =
        uploaded.liveProvider === true
          ? language === 'fr'
            ? 'Exécution de modèle/prestataire déclarée'
            : 'Reported model/provider run'
          : uploaded.decisionSource === 'SCRIPTED_NATIVE_COMPUTER_CALL_FIXTURE'
          ? language === 'fr'
            ? 'Exercice Computer Use natif programmé déclaré'
            : 'Reported scripted native Computer Use fixture'
          : language === 'fr'
          ? 'Observation opérateur/navigateur déclarée'
          : 'Reported operator/browser observation';
      $('provider-state').textContent = `${claim} · ${t.executionTrust}`;
      sync();
    }).finally(() => {
      $('evidence-input').value = '';
    });
  });
  try {
    initialMission = await createComputerMission();
    render();
    root.dataset.ready = 'true';
  } catch (error) {
    notify(`${t.error} ${error.message}`, true);
  }
}
