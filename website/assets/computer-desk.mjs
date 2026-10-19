export const defaultComputerDeskMission = {
  title: 'Meet the delivery schedule',
  requirements: {
    earlyUnits: 10,
    earlyDay: 7,
    totalUnits: 40,
    finalDay: 14,
    budgetCents: 51000,
  },
  suppliers: [
    {
      id: 'stellar',
      name: 'Stellar',
      unitCents: 1200,
      freightCents: 1000,
      deliveryDay: 7,
    },
    {
      id: 'laurentian',
      name: 'Laurentian',
      unitCents: 700,
      freightCents: 2000,
      deliveryDay: 12,
    },
    {
      id: 'boreal',
      name: 'Boreal',
      unitCents: 1400,
      freightCents: 0,
      deliveryDay: 5,
    },
  ],
};

const deskCopy = {
  en: {
    kicker: 'SUCCESSOR Ω / PUBLIC COMPUTER-USE TASK',
    title: 'Meet the deadline. Keep every requirement.',
    intro:
      'Read the supplier terms, enter an allocation and check the proposed plan. This synthetic desk cannot purchase, send messages or move money.',
    needs: 'The actual outcome',
    units: 'units',
    by: 'by day',
    budget: 'Budget ceiling',
    assumption: 'Additional workflow assumption',
    allEarly: 'One supplier; all units by the early deadline.',
    actual:
      'Staged delivery is permitted. The actual quantities, deadlines and budget stay unchanged.',
    terms: 'Source terms · fictional USD quotes',
    supplier: 'Supplier',
    unit: 'Unit price',
    freight: 'Freight per used supplier',
    delivery: 'Delivery day',
    termsHelp:
      'Any whole-unit quantity is permitted. Freight is charged once for each supplier used. No minimum order, tax, stock limit or volume discount is modeled.',
    allocations: 'Your proposed allocation',
    qty: 'Units from',
    evaluate: 'Check my plan',
    ready: 'Enter quantities, then check the plan. Nothing is ordered.',
    valid: 'This allocation meets the declared fixture requirements.',
    invalid:
      'This allocation does not meet every declared fixture requirement.',
    total: 'Total units',
    early: 'Units arriving by the early deadline',
    cost: 'Total cost, including freight',
    checks: 'Requirements checked',
    exactTotal: 'Exact required total',
    earlyDeadline: 'Early quantity and deadline',
    finalDeadline: 'Final deadline',
    budgetCheck: 'Budget ceiling',
    oneSupplier: 'Single-supplier assumption',
    allEarlyCheck: 'All units by the early deadline',
    pass: 'Pass',
    fail: 'Fail',
    output: 'Machine-readable observed result',
    boundary:
      'Browser interaction evidence only. Arithmetic checks do not establish independent proof, supplier reliability or authorization to purchase.',
  },
  fr: {
    kicker: 'SUCCESSOR Ω / TÂCHE PUBLIQUE COMPUTER USE',
    title: 'Respectez les délais. Gardez chaque exigence.',
    intro:
      'Lisez les conditions, saisissez une répartition et vérifiez le plan proposé. Ce bureau fictif ne peut ni acheter, ni envoyer de messages, ni déplacer de fonds.',
    needs: 'Le résultat réellement requis',
    units: 'unités',
    by: 'au plus tard au jour',
    budget: 'Budget maximal',
    assumption: 'Hypothèse de travail supplémentaire',
    allEarly: 'Un seul fournisseur; toutes les unités avant le premier délai.',
    actual:
      'Les livraisons échelonnées sont permises. Les quantités, délais et budget réels restent inchangés.',
    terms: 'Conditions sources · devis fictifs en dollars US',
    supplier: 'Fournisseur',
    unit: 'Prix unitaire',
    freight: 'Transport par fournisseur utilisé',
    delivery: 'Jour de livraison',
    termsHelp:
      'Toute quantité entière est permise. Le transport est facturé une seule fois par fournisseur utilisé. Aucun minimum, taxe, stock limité ou rabais de volume n’est modélisé.',
    allocations: 'Votre répartition proposée',
    qty: 'Unités de',
    evaluate: 'Vérifier mon plan',
    ready:
      'Saisissez les quantités puis vérifiez le plan. Aucune commande ne sera passée.',
    valid: 'Cette répartition respecte les exigences déclarées de l’exemple.',
    invalid:
      'Cette répartition ne respecte pas toutes les exigences déclarées de l’exemple.',
    total: 'Nombre total d’unités',
    early: 'Unités reçues avant le premier délai',
    cost: 'Coût total avec transport',
    checks: 'Exigences vérifiées',
    exactTotal: 'Quantité totale exacte',
    earlyDeadline: 'Quantité et premier délai',
    finalDeadline: 'Délai final',
    budgetCheck: 'Budget maximal',
    oneSupplier: 'Hypothèse du fournisseur unique',
    allEarlyCheck: 'Toutes les unités avant le premier délai',
    pass: 'Réussi',
    fail: 'Échec',
    output: 'Résultat observé lisible par machine',
    boundary:
      'Preuve d’interaction avec le navigateur seulement. Les contrôles arithmétiques n’établissent ni une preuve indépendante, ni la fiabilité d’un fournisseur, ni une autorisation d’achat.',
  },
};

const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
export const safeComputerJSON = (value) =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) =>
      ({
        '<': '\\u003c',
        '>': '\\u003e',
        '&': '\\u0026',
        '\u2028': '\\u2028',
        '\u2029': '\\u2029',
      }[c])
  );

function checkedConfig(mission, options = {}) {
  const language = options.language === 'fr' ? 'fr' : 'en';
  const requirements = mission.requirements;
  if (
    !requirements ||
    Object.values(requirements).some(
      (v) => !Number.isSafeInteger(v) || v < 0 || v > 100000000
    ) ||
    requirements.totalUnits < 1 ||
    requirements.totalUnits > 1000 ||
    requirements.earlyUnits > requirements.totalUnits ||
    requirements.earlyDay > requirements.finalDay
  )
    throw new Error('Invalid bounded desk requirements.');
  if (
    !Array.isArray(mission.suppliers) ||
    mission.suppliers.length !== 3 ||
    ['stellar', 'laurentian', 'boreal'].some(
      (id) => !mission.suppliers.some((s) => s.id === id)
    )
  )
    throw new Error(
      'The desk requires the three declared fixture supplier identities.'
    );
  const suppliers = ['stellar', 'laurentian', 'boreal'].map((id) => {
    const supplier = mission.suppliers.find((s) => s.id === id);
    if (
      typeof supplier.name !== 'string' ||
      supplier.name.length > 180 ||
      ['unitCents', 'freightCents', 'deliveryDay'].some(
        (key) =>
          !Number.isSafeInteger(supplier[key]) ||
          supplier[key] < 0 ||
          supplier[key] > 100000000
      )
    )
      throw new Error('Invalid bounded supplier terms.');
    return {
      id,
      name: supplier.name,
      unitCents: supplier.unitCents,
      freightCents: supplier.freightCents,
      deliveryDay: supplier.deliveryDay,
    };
  });
  const formulation =
    options.formulation === 'all_early' ? 'all_early' : 'actual_requirements';
  return {
    language,
    copy: deskCopy[language],
    mission: {
      title: String(mission.title || '').slice(0, 180),
      requirements: { ...requirements },
      suppliers,
      digest: typeof mission.digest === 'string' ? mission.digest : '',
    },
    formulation,
    ...(options.reportDigest
      ? { reportDigest: String(options.reportDigest) }
      : {}),
    ...(options.frozenProgramDigest
      ? { frozenProgramDigest: String(options.frozenProgramDigest) }
      : {}),
  };
}
export const computerDeskConfiguration = (mission, options = {}) =>
  checkedConfig(mission, options);

export function renderComputerDeskMarkup(mission, options = {}) {
  const config = checkedConfig(mission, options),
    t = config.copy,
    r = config.mission.requirements;
  const money = (cents) =>
    new Intl.NumberFormat(config.language, {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  return `<div class="computer-desk" data-computer-desk lang="${
    config.language
  }"><p class="cd-kicker">${escapeHTML(t.kicker)}</p><h1>${escapeHTML(
    t.title
  )}</h1><p class="cd-intro">${escapeHTML(
    t.intro
  )}</p><section class="cd-requirements" aria-labelledby="cd-needs-title"><h2 id="cd-needs-title">${escapeHTML(
    t.needs
  )}</h2><div class="cd-needs"><strong>${r.earlyUnits} ${escapeHTML(
    t.units
  )} ${escapeHTML(t.by)} ${r.earlyDay}</strong><strong>${
    r.totalUnits
  } ${escapeHTML(t.units)} ${escapeHTML(t.by)} ${
    r.finalDay
  }</strong><strong>${escapeHTML(t.budget)}: ${escapeHTML(
    money(r.budgetCents)
  )}</strong></div><p><b>${escapeHTML(t.assumption)}:</b> ${escapeHTML(
    config.formulation === 'all_early' ? t.allEarly : t.actual
  )}</p></section><section aria-labelledby="cd-source-title"><h2 id="cd-source-title">${escapeHTML(
    t.terms
  )}</h2><div class="cd-table-wrap" tabindex="0" role="region" aria-label="${escapeHTML(
    t.terms
  )}"><table><thead><tr><th scope="col">${escapeHTML(
    t.supplier
  )}</th><th scope="col">${escapeHTML(t.unit)}</th><th scope="col">${escapeHTML(
    t.freight
  )}</th><th scope="col">${escapeHTML(
    t.delivery
  )}</th></tr></thead><tbody>${config.mission.suppliers
    .map(
      (s) =>
        `<tr><th scope="row">${escapeHTML(s.name)}</th><td>${escapeHTML(
          money(s.unitCents)
        )}</td><td>${escapeHTML(money(s.freightCents))}</td><td>${
          s.deliveryDay
        }</td></tr>`
    )
    .join('')}</tbody></table></div><p class="cd-help">${escapeHTML(
    t.termsHelp
  )}</p></section><form id="cm-desk-form"><h2>${escapeHTML(
    t.allocations
  )}</h2><div class="cd-allocation-grid">${config.mission.suppliers
    .map(
      (s) =>
        `<div><label for="cm-qty-${s.id}">${escapeHTML(t.qty)} ${escapeHTML(
          s.name
        )}</label><input id="cm-qty-${s.id}" type="number" min="0" max="${
          r.totalUnits
        }" step="1" value="0" required inputmode="numeric"></div>`
    )
    .join('')}<button id="cm-desk-evaluate" type="submit">${escapeHTML(
    t.evaluate
  )}</button></div></form><p id="cm-desk-review" class="cd-status" role="status">${escapeHTML(
    t.ready
  )}</p><div id="cm-desk-summary" class="cd-summary" hidden></div><h2 class="cd-output-heading">${escapeHTML(
    t.output
  )}</h2><pre id="cm-desk-output" class="cd-output" tabindex="0" aria-label="${escapeHTML(
    t.output
  )}"></pre><p class="cd-help cd-boundary">${escapeHTML(
    t.boundary
  )}</p><script type="application/json" id="cm-desk-config">${safeComputerJSON(
    config
  )}</script></div>`;
}

export function initComputerDesk(root, providedConfig) {
  root.computerDesk?.dispose?.();
  const listenerAbort = new AbortController();
  const config =
    providedConfig ||
    JSON.parse(root.querySelector('#cm-desk-config').textContent);
  root.querySelector('#cm-desk-config').textContent = JSON.stringify(
    config
  ).replace(
    /[<>&\u2028\u2029]/g,
    (c) =>
      ({
        '<': '\\u003c',
        '>': '\\u003e',
        '&': '\\u0026',
        '\u2028': '\\u2028',
        '\u2029': '\\u2029',
      }[c])
  );
  const t = config.copy,
    mission = config.mission,
    requirements = mission.requirements;
  const get = (id) => root.querySelector(`#${id}`);
  const actions = [];
  let sequence = 0;
  const make = (tag, value) => {
    const el = document.createElement(tag);
    if (value !== undefined) el.textContent = value;
    return el;
  };
  const money = (cents) =>
    new Intl.NumberFormat(config.language, {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  const log = (type, detail, event) => {
    if (actions.length < 200)
      actions.push({
        sequence: ++sequence,
        type,
        ...detail,
        trustedUserEvent: Boolean(event?.isTrusted),
      });
  };
  const needs = root.querySelectorAll('.cd-needs strong');
  needs[0].textContent = `${requirements.earlyUnits} ${t.units} ${t.by} ${requirements.earlyDay}`;
  needs[1].textContent = `${requirements.totalUnits} ${t.units} ${t.by} ${requirements.finalDay}`;
  needs[2].textContent = `${t.budget}: ${money(requirements.budgetCents)}`;
  const assumption = root.querySelector('.cd-requirements p');
  assumption.replaceChildren();
  assumption.append(
    make('b', `${t.assumption}:`),
    document.createTextNode(
      ` ${config.formulation === 'all_early' ? t.allEarly : t.actual}`
    )
  );
  const rows = root.querySelectorAll('tbody tr');
  mission.suppliers.forEach((supplier, index) => {
    rows[index].children[0].textContent = supplier.name;
    rows[index].children[1].textContent = money(supplier.unitCents);
    rows[index].children[2].textContent = money(supplier.freightCents);
    rows[index].children[3].textContent = String(supplier.deliveryDay);
    const input = get(`cm-qty-${supplier.id}`);
    input.max = String(requirements.totalUnits);
    input.value = '0';
    root.querySelector(
      `label[for="cm-qty-${supplier.id}"]`
    ).textContent = `${t.qty} ${supplier.name}`;
  });
  get('cm-desk-output').textContent = '';
  get('cm-desk-summary').hidden = true;
  get('cm-desk-review').textContent = t.ready;
  const scrollRegion = root.querySelector('.cd-table-wrap');
  scrollRegion.setAttribute('role', 'region');
  scrollRegion.setAttribute('aria-label', t.terms);
  const updateScrollFocus = () => {
    scrollRegion.tabIndex =
      scrollRegion.scrollWidth > scrollRegion.clientWidth ? 0 : -1;
  };
  updateScrollFocus();
  window.addEventListener('resize', updateScrollFocus, {
    signal: listenerAbort.signal,
  });
  get('cm-desk-output').tabIndex = 0;
  for (const supplier of mission.suppliers)
    get(`cm-qty-${supplier.id}`).addEventListener(
      'input',
      (event) => {
        log(
          'ALLOCATION_INPUT',
          { supplierId: supplier.id, value: event.target.value },
          event
        );
        get('cm-desk-review').textContent = t.ready;
        get('cm-desk-output').textContent = '';
        get('cm-desk-summary').hidden = true;
      },
      { signal: listenerAbort.signal }
    );
  const evaluate = (event) => {
    event?.preventDefault();
    if (!get('cm-desk-form').reportValidity()) return;
    const allocations = mission.suppliers
      .map((s) => ({
        supplierId: s.id,
        units: Number(get(`cm-qty-${s.id}`).value),
      }))
      .filter((a) => a.units > 0);
    if (
      allocations.some(
        (a) =>
          !Number.isSafeInteger(a.units) ||
          a.units < 0 ||
          a.units > requirements.totalUnits
      )
    )
      return;
    const totals = { totalUnits: 0, earlyUnits: 0, costCents: 0 };
    let finalPass = true;
    for (const allocation of allocations) {
      const supplier = mission.suppliers.find(
        (s) => s.id === allocation.supplierId
      );
      totals.totalUnits += allocation.units;
      if (supplier.deliveryDay <= requirements.earlyDay)
        totals.earlyUnits += allocation.units;
      if (supplier.deliveryDay > requirements.finalDay) finalPass = false;
      totals.costCents +=
        allocation.units * supplier.unitCents + supplier.freightCents;
    }
    const checks = [
      {
        id: 'exact-total',
        passed: totals.totalUnits === requirements.totalUnits,
        detail: t.exactTotal,
      },
      {
        id: 'early-demand',
        passed: totals.earlyUnits >= requirements.earlyUnits,
        detail: t.earlyDeadline,
      },
      { id: 'final-deadline', passed: finalPass, detail: t.finalDeadline },
      {
        id: 'budget',
        passed: totals.costCents <= requirements.budgetCents,
        detail: t.budgetCheck,
      },
      ...(config.formulation === 'all_early'
        ? [
            {
              id: 'single-supplier',
              passed: allocations.length === 1,
              detail: t.oneSupplier,
            },
            {
              id: 'all-early',
              passed: totals.earlyUnits === requirements.totalUnits,
              detail: t.allEarlyCheck,
            },
          ]
        : []),
    ];
    const valid = checks.every((check) => check.passed);
    log('CHECK_PLAN', { valid }, event);
    const result = {
      schemaVersion: '1.0.0',
      kind: 'SupplierDeskResult',
      missionDigest: mission.digest,
      ...(config.reportDigest ? { reportDigest: config.reportDigest } : {}),
      ...(config.frozenProgramDigest
        ? { frozenProgramDigest: config.frozenProgramDigest }
        : {}),
      formulation: config.formulation,
      plan: {
        schemaVersion: '1.0.0',
        kind: 'SupplierAllocationPlan',
        allocations,
        costCents: totals.costCents,
      },
      check: { valid, totals },
      purchaseExecuted: false,
      executionKind: 'USER_OR_SCRIPTED_BROWSER_INTERACTION',
      actions: actions.map((a) => ({ ...a })),
    };
    get('cm-desk-review').textContent = valid ? t.valid : t.invalid;
    get('cm-desk-review').dataset.valid = String(valid);
    const summary = get('cm-desk-summary');
    summary.replaceChildren();
    summary.hidden = false;
    for (const [label, value] of [
      [t.total, String(totals.totalUnits)],
      [t.early, String(totals.earlyUnits)],
      [t.cost, money(totals.costCents)],
    ]) {
      const item = make('div');
      item.append(make('strong', value), make('span', label));
      summary.append(item);
    }
    const list = make('ul');
    for (const check of checks)
      list.append(
        make('li', `${check.passed ? t.pass : t.fail} · ${check.detail}`)
      );
    summary.append(list);
    get('cm-desk-output').textContent =
      'SUCCESSOR_COMPUTER_RESULT ' + JSON.stringify(result);
    root.dispatchEvent(
      new CustomEvent('computer-desk-result', { bubbles: true, detail: result })
    );
    return result;
  };
  get('cm-desk-form').addEventListener('submit', evaluate, {
    signal: listenerAbort.signal,
  });
  root.computerDesk = {
    dispose() {
      listenerAbort.abort();
    },
    fill(allocations) {
      for (const supplier of mission.suppliers) {
        const input = get(`cm-qty-${supplier.id}`);
        input.value = String(
          allocations.find((a) => a.supplierId === supplier.id)?.units || 0
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    check() {
      get('cm-desk-evaluate').click();
      return get('cm-desk-output').textContent;
    },
  };
  root.dataset.ready = 'true';
}

export const computerDeskCSS = `.computer-desk{color-scheme:dark;font-family:system-ui,sans-serif;color:#f8f1ff;background:#110b1c}.computer-desk *{box-sizing:border-box}.computer-desk{max-width:1050px;padding:28px;margin:auto;font-size:14px;line-height:1.5;overflow-wrap:anywhere}.computer-desk h1{font-size:32px;line-height:1.1;letter-spacing:-1px;margin:10px 0 14px}.computer-desk h2{font-size:17px;letter-spacing:0;margin:20px 0 10px}.computer-desk p{margin:9px 0}.cd-kicker{color:#efd69c;font-size:10px;font-weight:650;letter-spacing:1.5px}.cd-intro,.cd-help{color:#c6bad8}.cd-intro{max-width:85ch}.cd-help{font-size:11px;line-height:1.6}.cd-requirements{background:#2b1c3a;border:1px solid #795d87;border-radius:9px;padding:13px 18px;margin-top:18px}.cd-requirements h2{margin:0 0 7px}.cd-needs{display:flex;gap:16px;flex-wrap:wrap;color:#f1d79c;font-size:13px}.cd-requirements p{font-size:12px;color:#ddd0e8}.cd-table-wrap{max-width:100%;overflow-x:auto}.computer-desk table{width:100%;border-collapse:collapse;text-align:left;min-width:460px}.computer-desk th,.computer-desk td{padding:9px 12px;border-bottom:1px solid #655071}.computer-desk th{font-size:11px;color:#efd69c;font-weight:600}.computer-desk td{font-size:13px}.cd-allocation-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:15px;align-items:end}.computer-desk label{display:block;font-size:12px;margin-bottom:7px;font-weight:600}.computer-desk input{width:100%;max-width:100%;min-width:0;padding:11px;border:1px solid #9e82b2;color:#fff;background:#1b1126;border-radius:5px;font:inherit}.computer-desk button{padding:12px 18px;font:600 13px/1.4 system-ui;background:#efd69c;color:#25182f;border:1px solid #efd69c;border-radius:5px;cursor:pointer}.computer-desk :focus-visible{outline:3px solid #b8e7d7;outline-offset:4px}.cd-status{border-left:3px solid #c1a4e8;padding:11px 14px;background:#251a30;font-size:13px}.cd-status[data-valid=true]{border-color:#b8e7d7}.cd-status[data-valid=false]{border-color:#f1b4c1}.cd-summary{display:flex;gap:15px;flex-wrap:wrap}.cd-summary div{border:1px solid #655071;border-radius:6px;padding:10px 13px;flex:1 1 150px}.cd-summary strong{display:block;font-size:22px;color:#efd69c}.cd-summary span{font-size:11px;color:#c6bad8}.cd-summary ul{display:flex;gap:6px 18px;flex-wrap:wrap;font-size:11px;color:#d7c9e4;padding-left:18px;margin:5px 0}.cd-output-heading{font-size:12px!important}.cd-output{white-space:pre-wrap;overflow-wrap:anywhere;max-height:120px;overflow:auto;background:#170f21;border:1px solid #655071;border-radius:5px;padding:12px;font:10px/1.5 monospace}.cd-output:empty{display:none}.cd-boundary{margin-top:16px!important}@media(max-width:640px){.computer-desk{padding:23px 18px}.computer-desk h1{font-size:29px}.cd-allocation-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.cd-allocation-grid button{grid-column:1/-1}.cd-needs{gap:8px}.cd-needs strong{flex:1 1 180px}.computer-desk th,.computer-desk td{padding:9px 8px}}`;

export function renderComputerDeskDocument(mission, options = {}) {
  const config = checkedConfig(mission, options);
  const runtime = `(${computerDeskRuntimeSource})(document.querySelector('[data-computer-desk]'));`;
  return `<!doctype html><html lang="${
    config.language
  }"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SUCCESSOR Ω · Supplier desk</title><style>body{margin:0;background:#110b1c}${computerDeskCSS}</style></head><body><main>${renderComputerDeskMarkup(
    mission,
    options
  )}</main><script>${runtime}</script></body></html>`;
}
import { computerDeskRuntimeSource } from './computer-desk-runtime-source.mjs';
