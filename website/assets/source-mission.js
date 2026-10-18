import { sourceMissionCopy } from './source-mission-copy.mjs';
import {
  createSourceMission,
  freezeSourceStrategy,
  confirmSourceStrategy,
  annotateSourceMission,
  exportSourceMission,
  restoreSourceMission,
  compileSourceMissionJobs,
} from '../../packages/successor-core/src/source-mission.mjs';

const root = document.querySelector('[data-source-mission]');
if (root) {
  const language = root.dataset.language === 'fr' ? 'fr' : 'en';
  const t = sourceMissionCopy[language];
  const $ = (id) => document.getElementById(`sm-${id}`);
  const json = (value) => JSON.stringify(value, null, 2);
  const percent = (value) =>
    new Intl.NumberFormat(language, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(value);
  const delta = (value) =>
    `${value > 0 ? '+' : ''}${new Intl.NumberFormat(language, {
      maximumFractionDigits: 1,
    }).format(value * 100)} ${language === 'fr' ? 'points' : 'points'}`;
  const node = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  let dossier = null,
    compiled = null,
    selected = 'coverage_diversity',
    busy = false,
    snapshot = '';
  const sample =
    language === 'fr'
      ? {
          title: 'Une mission de batteries plus réparables',
          sourceTitle: 'Note de mission illustrative sur les batteries — CC0',
          goal: 'Quels éléments sur la réparation, le coût, la durée et la prochaine expérience manquent pour réduire notre incertitude ?',
          text: 'Cette note est une démonstration originale fictive et non une recherche sur les batteries. Elle ne contient aucune mesure expérimentale ni recommandation de sécurité.\n\nL’équipe compare deux plans d’achat de batteries pour un appareil de démonstration. Le plan actuel classe les options par prix d’achat et conserve les informations de chaque fournisseur dans des notes séparées.\n\nUne option modulaire pourrait simplifier la réparation, mais son coût total reste inconnu. Le prix d’achat seul ne permet pas de déterminer le coût de possession.\n\nLes durées annoncées par les fournisseurs utilisent des conditions différentes. Aucune comparaison de durée ne doit être acceptée avant de définir un protocole commun et de conserver les résultats défavorables.\n\nLa prochaine expérience devrait comparer le temps de réparation en plus du prix d’achat. Le plan doit préciser les conditions, le nombre d’essais et les critères d’arrêt avant de recueillir des observations.\n\nL’incertitude principale concerne la fréquence réelle des pannes et le coût des pièces de remplacement. Une revue distincte doit déterminer si la réparation répond au besoin de l’acheteur.\n\nUne autre approche consiste à louer des batteries remplaçables plutôt qu’à améliorer le produit existant. Cette question change le plan d’achat, mais ne supprime aucune exigence de sécurité ni obligation de vérification.',
          freshTitle:
            'Deuxième note illustrative : remplacement et maintenance — CC0',
          freshText:
            'Cette seconde note est également un exemple fictif dédié au domaine public. Elle ne valide aucun dispositif réel.\n\nLe prix d’achat a diminué, mais cela ne prouve pas une réduction du coût total. L’équipe ne doit pas confondre une négation avec une preuve favorable.\n\nLes essais de réparation ont été planifiés sans être exécutés. Il faut comparer leur durée et leurs résultats avant de conclure à une amélioration.\n\nLa prochaine expérience examinera le coût des pièces et les conditions de retour au fournisseur. Les données de durée restent absentes.\n\nUne incertitude persiste sur la disponibilité des pièces au moment d’une panne. Le plan actuel reste en place dans l’attente d’une revue indépendante.\n\nL’acheteur pourrait louer un ensemble de remplacement pour éviter les réparations urgentes. Ce changement de question doit être comparé aux mêmes contraintes et critères d’acceptation.',
        }
      : {
          title: 'A more repairable battery mission',
          sourceTitle: 'Illustrative battery mission note — CC0',
          goal: 'What repair, cost, lifetime and experiment evidence is missing, and what uncertainty should we resolve next?',
          text: 'This is an original fictional demonstration note, not battery research. It contains no experimental measurements or safety recommendation.\n\nThe team is comparing two battery procurement plans for a demonstration device. The current method ranks options by purchase price and keeps each supplier’s information in separate notes.\n\nA modular option might simplify repair, but its total cost is unknown. Purchase price alone does not determine the cost of ownership.\n\nSupplier lifetime claims use different operating conditions. No lifetime comparison should be accepted before a shared protocol is defined and unfavorable outcomes are retained.\n\nThe next experiment should compare repair time as well as purchase price. The plan should declare its conditions, trial count and stopping rules before observations are collected.\n\nThe main uncertainty concerns actual failure frequency and replacement-part cost. A separate review must determine whether repair serves the buyer’s goal.\n\nAn alternative is to lease replaceable batteries rather than improve the existing product. This reframes the procurement question without removing any safety requirement or verification obligation.',
          freshTitle:
            'Fresh illustrative note: replacement and maintenance — CC0',
          freshText:
            'This second note is also a fictional public-domain example. It validates no real device.\n\nThe purchase price fell, but this does not establish a lower total cost. A negative statement must not be mistaken for favorable evidence.\n\nRepair trials have been planned but not performed. Their duration and outcomes must be compared before an improvement is claimed.\n\nThe next experiment will examine replacement-part cost and supplier return conditions. Lifetime observations are still absent.\n\nUncertainty remains about part availability when a device fails. The current method stays in place pending independent review.\n\nThe buyer could lease a replacement pool to avoid urgent repair. This different question must be compared under the same constraints and acceptance criteria.',
        };
  function inputs() {
    return {
      title: $('title-input').value,
      sourceTitle: $('source-title').value,
      goal: $('goal').value,
      text: $('text').value,
      url: $('url').value.trim(),
      quoteBudget: Number($('budget').value),
      publicNonPersonal: $('public').checked,
    };
  }
  const dirty = () => Boolean(dossier && snapshot !== json(inputs()));
  function notify(message, error = false) {
    $('status').textContent = message;
    $('status').dataset.error = String(error);
  }
  function sync() {
    const changed = dirty();
    $('edited-status').hidden = !changed;
    for (const id of ['sample', 'clear', 'create', 'restore'])
      $(id).disabled = busy;
    for (const id of ['export', 'report', 'save-brief', 'method'])
      $(id).disabled = busy || !dossier;
    $('freeze').disabled =
      busy || !dossier || Boolean(dossier.frozen) || changed;
    $('confirm').disabled =
      busy || !dossier?.frozen || Boolean(dossier?.confirmation) || changed;
    $('jobs').disabled = busy || !dossier || changed;
    $('download-jobs').disabled = busy || !compiled || changed;
    $('fresh-example').disabled = busy || Boolean(dossier?.confirmation);
    root.setAttribute('aria-busy', String(busy));
  }
  async function operation(work) {
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
  function moveTo(id) {
    $(id).scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  }
  function latestAnnotation(strategyId = selected, phase = 'development') {
    return dossier?.annotations
      .filter(
        (entry) => entry.strategyId === strategyId && entry.phase === phase
      )
      .at(-1);
  }
  function currentNotes() {
    return {
      phase: 'development',
      strategyId: selected,
      brief: $('brief').value,
      notes: [...root.querySelectorAll('[data-source-note]')]
        .map((input) => ({
          passageId: input.dataset.sourceNote,
          relevance: input.value,
        }))
        .filter((entry) => entry.relevance.trim()),
    };
  }
  async function saveNotes() {
    if (!dossier) return;
    const annotation = currentNotes();
    const previous = latestAnnotation();
    if (!previous && !annotation.brief && !annotation.notes.length) return;
    if (
      previous &&
      previous.brief === annotation.brief &&
      json(previous.notes) === json(annotation.notes)
    )
      return;
    dossier = await annotateSourceMission(dossier, annotation);
    compiled = null;
    renderDossier();
  }
  function showPassages(
    container,
    result,
    { editable = false, annotation } = {}
  ) {
    container.replaceChildren();
    if (!result?.passages.length) {
      container.append(node('p', t.exactEmpty, 'sm-help'));
      return;
    }
    for (const passage of result.passages) {
      const article = node('article', undefined, 'sm-passage');
      const meta = node('div', undefined, 'sm-passage-meta');
      meta.append(
        node('span', passage.id, 'sm-passage-id'),
        node('span', `${t.sourceLocation}: ${passage.start}–${passage.end}`)
      );
      article.append(meta, node('blockquote', passage.text));
      if (editable) {
        const label = node('label', t.relevance);
        const input = node('textarea');
        input.id = `sm-note-${passage.id}`;
        input.rows = 2;
        input.maxLength = 1000;
        input.dataset.sourceNote = passage.id;
        input.value =
          annotation?.notes.find((entry) => entry.passageId === passage.id)
            ?.relevance || '';
        label.htmlFor = input.id;
        article.append(label, input);
      }
      container.append(article);
    }
  }
  function showMetrics(container, metrics) {
    container.replaceChildren();
    for (const [value, label] of metrics) {
      const item = node('div', undefined, 'sm-metric');
      item.append(node('strong', value), node('span', label));
      container.append(item);
    }
  }
  function attribution(container, source) {
    container.replaceChildren(node('span', source.title));
    if (source.url) {
      const link = node('a', ' ↗');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', source.title);
      container.append(link);
    }
  }
  function renderBrief() {
    if (!dossier) return;
    const result = dossier.development.results.find(
      (entry) => entry.strategyId === selected
    );
    $('method').value = selected;
    $('method-description').textContent = t.strategies[selected][1];
    showMetrics($('metrics'), [
      [percent(result.metrics.goalTermCoverage), t.termCoverage],
      [percent(result.metrics.sectionCoverage), t.sectionCoverage],
      [String(result.metrics.quoteCount), t.passages],
    ]);
    showPassages($('passages'), result, {
      editable: true,
      annotation: latestAnnotation(),
    });
    $('brief').value = latestAnnotation()?.brief || '';
    $('notes-status').textContent = '';
    $('review-questions').replaceChildren();
    const questions =
      language === 'fr'
        ? [
            'Ces citations sont-elles pertinentes pour la décision, dans leur contexte complet ?',
            `${t.covered} : ${
              result.metrics.coveredGoalTerms.join(', ') || t.noTerms
            }. ${t.missing} : ${
              result.metrics.missingGoalTerms.join(', ') || t.noTerms
            }.`,
            'Quelle qualification importante pourrait manquer, même lorsque tous les mots sont présents ?',
            'Une autre question ou une méthode existante servirait-elle mieux le besoin sans réduire les contraintes ?',
          ]
        : [
            'Do these quotations actually help the decision when read in their complete context?',
            `${t.covered}: ${
              result.metrics.coveredGoalTerms.join(', ') || t.noTerms
            }. ${t.missing}: ${
              result.metrics.missingGoalTerms.join(', ') || t.noTerms
            }.`,
            'Which decisive qualification could be missing even when every goal word is present?',
            'Could a different question or an existing method better serve the goal without weakening its constraints?',
          ];
    for (const question of questions)
      $('review-questions').append(node('li', question));
    for (const row of $('comparison').children)
      row.dataset.selected = String(row.dataset.strategy === selected);
    $('frozen-method').textContent = dossier.frozen
      ? `${t.frozenLabel}: ${t.strategies[dossier.frozen.strategyId][0]}`
      : t.strategies[selected][0];
  }
  function renderDossier() {
    $('dossier-json').textContent = dossier ? json(dossier) : '{}';
    $('history').replaceChildren();
    for (const event of dossier?.history || [])
      $('history').append(
        node(
          'li',
          `${event.sequence}. ${event.type} · ${event.digest.slice(0, 24)}…`
        )
      );
    $('jobs-result').hidden = !compiled;
    if (compiled) {
      $('jobs-json').textContent = json(compiled);
      $(
        'jobs-summary'
      ).textContent = `${compiled.graph.nodes.length} · DRAFT · ${compiled.fundingStatus} · ${compiled.signatureStatus} · ${compiled.identityStatus}`;
    }
  }
  function render() {
    $('results').hidden = !dossier;
    $('empty-save').hidden = Boolean(dossier);
    if (!dossier) {
      $('fresh-form').hidden = true;
      $('transfer').hidden = true;
      renderDossier();
      sync();
      return;
    }
    $('mission-goal').textContent = `${dossier.title} — ${dossier.goal}`;
    $('development-source').textContent = dossier.source.text;
    $('development-digest').textContent = dossier.source.digest;
    attribution($('source-attribution'), dossier.source);
    $('method').replaceChildren();
    $('comparison').replaceChildren();
    for (const result of dossier.development.results) {
      const option = node('option', t.strategies[result.strategyId][0]);
      option.value = result.strategyId;
      $('method').append(option);
      const row = node('tr');
      row.dataset.strategy = result.strategyId;
      const cell = node('td');
      const choose = node(
        'button',
        t.strategies[result.strategyId][0],
        'sm-table-method'
      );
      choose.type = 'button';
      choose.addEventListener('click', () => changeMethod(result.strategyId));
      cell.append(choose);
      row.append(
        cell,
        node('td', percent(result.metrics.goalTermCoverage)),
        node('td', percent(result.metrics.sectionCoverage)),
        node('td', String(result.metrics.quoteCount))
      );
      $('comparison').append(row);
    }
    $('fresh-form').hidden = !dossier.frozen || Boolean(dossier.confirmation);
    $('transfer').hidden = !dossier.confirmation;
    if (dossier.confirmation) {
      const fresh = dossier.confirmation;
      attribution($('fresh-attribution'), fresh.source);
      showMetrics($('transfer-metrics'), [
        [delta(fresh.comparison.goalTermCoverageDelta), t.transferDelta],
        [delta(fresh.comparison.sectionCoverageDelta), t.transferSections],
        [t.absent, t.proof],
      ]);
      showPassages(
        $('fresh-candidate'),
        fresh.results.find(
          (entry) => entry.strategyId === fresh.comparison.candidateId
        )
      );
      showPassages(
        $('fresh-incumbent'),
        fresh.results.find((entry) => entry.strategyId === 'sequential')
      );
      $('confirmation-source').textContent = fresh.source.text;
      $('confirmation-digest').textContent = fresh.source.digest;
      $('fresh-comparison').replaceChildren();
      $('fresh-control-passages').replaceChildren();
      for (const result of fresh.results) {
        const row = node('tr');
        row.append(
          node('td', t.strategies[result.strategyId][0]),
          node('td', percent(result.metrics.goalTermCoverage)),
          node('td', percent(result.metrics.sectionCoverage)),
          node('td', String(result.metrics.quoteCount))
        );
        $('fresh-comparison').append(row);
        const method = node('div');
        const quotes = node('div', undefined, 'sm-passages');
        method.append(node('h3', t.strategies[result.strategyId][0]), quotes);
        showPassages(quotes, result);
        $('fresh-control-passages').append(method);
      }
    }
    renderBrief();
    renderDossier();
    sync();
  }
  async function changeMethod(id) {
    if (!dossier || busy || id === selected) return;
    await operation(async () => {
      await saveNotes();
      selected = id;
      renderBrief();
    });
    $('method').value = selected;
  }
  async function create() {
    if (!$('form').reportValidity()) {
      notify(t.required, true);
      return;
    }
    notify(t.running);
    const submitted = inputs();
    const result = await createSourceMission(submitted);
    dossier = result;
    compiled = null;
    selected = 'coverage_diversity';
    snapshot = json(submitted);
    $('fresh-form').reset();
    render();
    notify(t.ready);
    moveTo('brief-section');
  }
  function download(content, filename, type = 'application/json') {
    const objectURL = URL.createObjectURL(new Blob([content], { type }));
    const anchor = node('a');
    anchor.href = objectURL;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
  }
  function reportText() {
    const lines = [
      dossier.title,
      '='.repeat(48),
      dossier.goal,
      '',
      t.reportBoundary,
      '',
      `Source: ${dossier.source.title}`,
      `URL: ${dossier.source.url || '—'}`,
      `${t.sourceDigest}: ${dossier.source.digest}`,
      '',
      `Method: ${t.strategies[selected][0]}`,
      '',
    ];
    const result = dossier.development.results.find(
      (entry) => entry.strategyId === selected
    );
    for (const passage of result.passages) {
      lines.push(
        `[${passage.id}] ${t.sourceLocation}: ${passage.start}–${passage.end}`,
        passage.text,
        ''
      );
      const note = latestAnnotation()?.notes.find(
        (entry) => entry.passageId === passage.id
      );
      if (note) lines.push(`${t.relevance}: ${note.relevance}`, '');
    }
    lines.push(t.notesLabel, latestAnnotation()?.brief || '—', '', t.controls);
    for (const entry of dossier.development.results)
      lines.push(
        `${t.strategies[entry.strategyId][0]} | ${t.termCoverage}: ${percent(
          entry.metrics.goalTermCoverage
        )} | ${t.sectionCoverage}: ${percent(
          entry.metrics.sectionCoverage
        )} | ${t.passages}: ${entry.metrics.quoteCount}`
      );
    if (dossier.frozen)
      lines.push(
        '',
        `${t.frozenLabel}: ${t.strategies[dossier.frozen.strategyId][0]}`,
        dossier.frozen.digest
      );
    if (dossier.confirmation) {
      const fresh = dossier.confirmation;
      lines.push(
        '',
        t.transferTitle,
        t.transferBody,
        `${t.transferDelta}: ${delta(fresh.comparison.goalTermCoverageDelta)}`,
        `${t.transferSections}: ${delta(
          fresh.comparison.sectionCoverageDelta
        )}`,
        `Source: ${fresh.source.title}`,
        `${t.sourceDigest}: ${fresh.source.digest}`,
        ''
      );
      for (const [id, label] of [
        [fresh.comparison.candidateId, t.candidate],
        ['sequential', t.incumbent],
      ]) {
        lines.push(label);
        for (const passage of fresh.results.find(
          (entry) => entry.strategyId === id
        ).passages)
          lines.push(
            `[${passage.id}] ${passage.start}–${passage.end}`,
            passage.text,
            ''
          );
      }
    }
    lines.push(
      '',
      `Dossier: ${dossier.digest}`,
      `History: ${dossier.historyDigest}`,
      t.reportBoundary
    );
    return lines.join('\n');
  }
  $('form').addEventListener('submit', (event) => {
    event.preventDefault();
    operation(create);
  });
  $('form').addEventListener('input', () => {
    $('sample-note').hidden = true;
    sync();
  });
  $('sample').addEventListener('click', () =>
    operation(async () => {
      $('title-input').value = sample.title;
      $('source-title').value = sample.sourceTitle;
      $('goal').value = sample.goal;
      $('text').value = sample.text;
      $('url').value = '';
      $('public').checked = true;
      $('budget').value = '4';
      $('sample-note').hidden = false;
      await create();
    })
  );
  $('clear').addEventListener('click', () => {
    if (busy) return;
    dossier = null;
    compiled = null;
    snapshot = '';
    selected = 'coverage_diversity';
    $('form').reset();
    $('fresh-form').reset();
    $('sample-note').hidden = true;
    render();
    notify(t.resetStatus);
    $('title-input').focus();
    moveTo('workspace');
  });
  $('method').addEventListener('change', () => changeMethod($('method').value));
  $('save-brief').addEventListener('click', () =>
    operation(async () => {
      await saveNotes();
      $('notes-status').textContent = t.savedBrief;
    })
  );
  $('freeze').addEventListener('click', () =>
    operation(async () => {
      if (dirty()) throw new Error(t.edited);
      await saveNotes();
      dossier = await freezeSourceStrategy(dossier, { strategyId: selected });
      compiled = null;
      render();
      notify(t.freezeStatus);
      $('fresh-title').focus();
      moveTo('fresh-form');
    })
  );
  $('fresh-example').addEventListener('click', () => {
    if (busy || dossier?.confirmation) return;
    $('fresh-title').value = sample.freshTitle;
    $('fresh-text').value = sample.freshText;
    $('fresh-url').value = '';
    $('fresh-public').checked = true;
    $('fresh-unused').checked = false;
  });
  $('fresh-form').addEventListener('submit', (event) => {
    event.preventDefault();
    operation(async () => {
      if (dirty()) throw new Error(t.edited);
      if (!$('fresh-form').reportValidity()) {
        notify(t.required, true);
        return;
      }
      await saveNotes();
      notify(t.confirming);
      dossier = await confirmSourceStrategy(dossier, {
        title: $('fresh-title').value,
        text: $('fresh-text').value,
        url: $('fresh-url').value.trim(),
        publicNonPersonal: $('fresh-public').checked,
        notUsedForDevelopment: $('fresh-unused').checked,
      });
      compiled = null;
      render();
      notify(t.transferComplete);
      moveTo('transfer');
    });
  });
  $('export').addEventListener('click', () =>
    operation(async () => {
      await saveNotes();
      download(
        await exportSourceMission(dossier),
        'successor-source-mission.json'
      );
    })
  );
  $('report').addEventListener('click', () =>
    operation(async () => {
      await saveNotes();
      download(
        reportText(),
        'successor-evidence-brief.txt',
        'text/plain;charset=utf-8'
      );
    })
  );
  $('jobs').addEventListener('click', () =>
    operation(async () => {
      if (dirty()) throw new Error(t.edited);
      await saveNotes();
      compiled = await compileSourceMissionJobs(dossier);
      renderDossier();
      notify(t.jobsStatus);
    })
  );
  $('download-jobs').addEventListener('click', () => {
    if (compiled && !dirty() && !busy)
      download(json(compiled), 'successor-source-work-orders.json');
  });
  $('restore').addEventListener('change', () => {
    const file = $('restore').files[0];
    if (!file) return;
    operation(async () => {
      if (file.size > 2 * 1024 * 1024)
        throw new Error(
          language === 'fr'
            ? 'Le dossier doit mesurer au plus 2 Mo.'
            : 'The dossier must be at most 2 MB.'
        );
      const result = await restoreSourceMission(await file.text());
      dossier = result;
      compiled = null;
      selected = dossier.frozen?.strategyId || 'coverage_diversity';
      $('title-input').value = dossier.title;
      $('source-title').value = dossier.source.title;
      $('goal').value = dossier.goal;
      $('text').value = dossier.source.text;
      $('url').value = dossier.source.url;
      $('budget').value = String(dossier.quoteBudget);
      $('public').checked = true;
      $('sample-note').hidden = true;
      $('fresh-form').reset();
      snapshot = json(inputs());
      render();
      notify(t.importDone);
      moveTo('brief-section');
    }).finally(() => {
      $('restore').value = '';
    });
  });
  render();
  root.dataset.ready = 'true';
}
