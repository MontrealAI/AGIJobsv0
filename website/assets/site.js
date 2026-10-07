import { initAlphaMark } from './alpha-mark.js';
import { initWorkPlanner } from './work.js';
import { initEvidenceReview } from './review.js';
import { initSourceLab } from './source-lab.js';
import { advance, receipt, stages } from './lifecycle.mjs';

document.documentElement.classList.add('js');
initEvidenceReview();

const $ = (selector) => document.querySelector(selector);
const menu = $('#menu-toggle');
if (menu)
  menu.addEventListener('click', () => {
    const expanded = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(expanded));
    $('#site-nav').classList.toggle('is-open', expanded);
  });
document.querySelectorAll('#site-nav a').forEach((link) =>
  link.addEventListener('click', () => {
    menu?.setAttribute('aria-expanded', 'false');
    $('#site-nav')?.classList.remove('is-open');
  })
);

document.addEventListener('keydown', (event) => {
  if (
    event.key === 'Escape' &&
    menu?.getAttribute('aria-expanded') === 'true'
  ) {
    menu.setAttribute('aria-expanded', 'false');
    $('#site-nav').classList.remove('is-open');
    menu.focus();
  }
});

const search = $('#catalog-search');
if (search) {
  const cards = [...document.querySelectorAll('[data-demo-card]')];
  const params = new URLSearchParams(location.search);
  search.value = params.get('q') || '';
  const theme = $('#catalog-theme');
  const type = $('#catalog-type');
  for (const [field, value] of [
    [theme, params.get('theme')],
    [type, params.get('type')],
  ]) {
    if ([...field.options].some((option) => option.value === value))
      field.value = value;
  }
  let limit = 12;
  function filter(updateURL = true) {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = cards.filter(
      (card) =>
        (!query ||
          query
            .split(/\s+/)
            .every((part) => card.dataset.search.includes(part))) &&
        (!theme.value || card.dataset.theme === theme.value) &&
        (!type.value || card.dataset.kind === type.value)
    );
    const selected = new Set(matches.slice(0, limit));
    cards.forEach((card) => {
      card.hidden = !selected.has(card);
    });
    $('#catalog-count').textContent = `${matches.length} ${
      matches.length === 1 ? 'entry' : 'entries'
    } found · ${Math.min(limit, matches.length)} shown`;
    $('#catalog-empty').hidden = matches.length !== 0;
    $('#catalog-more').hidden = matches.length <= limit;
    if (updateURL) {
      const url = new URL(location.href);
      for (const [key, value] of [
        ['q', search.value.trim()],
        ['theme', theme.value],
        ['type', type.value],
      ]) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
      history.replaceState(null, '', url);
    }
  }
  for (const input of [search, theme, type])
    input.addEventListener('input', () => {
      limit = 12;
      filter();
    });
  $('#catalog-reset').addEventListener('click', () => {
    search.value = '';
    theme.value = '';
    type.value = '';
    limit = 12;
    filter();
    search.focus();
  });
  $('#catalog-more').addEventListener('click', () => {
    const firstNew = cards.filter(
      (card) =>
        card.hidden &&
        (!search.value.trim() ||
          search.value
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .every((part) => card.dataset.search.includes(part))) &&
        (!theme.value || card.dataset.theme === theme.value) &&
        (!type.value || card.dataset.kind === type.value)
    )[0];
    limit += 12;
    filter();
    firstNew?.querySelector('a')?.focus({ preventScroll: true });
  });
  filter(false);
}

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
      $('#copy-status').textContent = 'Command copied to clipboard.';
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 1800);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(button.dataset.copy));
      selection.removeAllRanges();
      selection.addRange(range);
      $('#copy-status').textContent =
        'Command selected. Use your keyboard or browser menu to copy.';
    }
  });
});

const simulator = $('#walkthrough');
if (simulator) {
  let state;
  const scenario = $('#scenario');
  const evidence = $('#evidence');
  const vote = $('#vote');
  const inputs = () => ({ evidence: evidence.checked, vote: vote.value });
  function render() {
    $('#walkthrough-status').textContent = state.outcome;
    $('#walkthrough-detail').textContent =
      state.events.at(-1) ||
      'Agree on the mission, then follow its evidence through validation and settlement.';
    document.querySelectorAll('[data-stage]').forEach((item, index) => {
      item.dataset.state =
        index < state.step
          ? 'complete'
          : index === state.step
          ? state.blocked
            ? 'blocked'
            : 'current'
          : 'waiting';
      if (index === state.step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      item.querySelector('.stage-status').textContent =
        index < state.step
          ? 'Complete'
          : index === state.step
          ? state.blocked
            ? 'Held'
            : 'Next'
          : 'Waiting';
    });
    $('#walkthrough-next').disabled =
      state.blocked || state.step === stages.length;
    $('#walkthrough-next').textContent = state.blocked
      ? 'Settlement blocked'
      : state.step === stages.length
      ? 'Walkthrough complete'
      : `${stages[state.step]} →`;
    $('#walkthrough-download').disabled = state.step === 0 && !state.blocked;
    for (const element of [scenario, evidence, vote])
      element.disabled = state.step > 0 || state.blocked;
    const selected = scenario.selectedOptions[0];
    $(
      '#scenario-detail'
    ).textContent = `${selected.dataset.k} required approvals · ${selected.dataset.n} selected validators. The happy path uses unanimous approval; actual contracts also enforce their configured threshold and timing rules.`;
  }
  function reset() {
    state = {
      step: 0,
      events: [],
      blocked: false,
      outcome: 'Ready to explore',
    };
    render();
  }
  $('#walkthrough-next').addEventListener('click', () => {
    state = advance(state, inputs());
    render();
  });
  $('#walkthrough-reset').addEventListener('click', reset);
  scenario.addEventListener('change', render);
  $('#walkthrough-download').addEventListener('click', () => {
    const option = scenario.selectedOptions[0];
    const payload = receipt(
      state,
      {
        name: option.textContent,
        source: option.value,
        requiredApprovals: Number(option.dataset.k),
        validators: Number(option.dataset.n),
      },
      inputs()
    );
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2) + '\n'], {
        type: 'application/json',
      })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agi-jobs-browser-walkthrough.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#download-status').textContent =
      'Simulation receipt downloaded. It contains no blockchain transaction.';
  });
  reset();
}

const diagrams = [...document.querySelectorAll('[data-diagram]')];
if (diagrams.length) {
  let library;
  let queue = Promise.resolve();
  const render = (element) => {
    if (element.dataset.loaded) return;
    element.dataset.loaded = 'true';
    queue = queue.then(async () => {
      try {
        library ||= import('./diagrams.js');
        const { renderDiagram } = await library;
        await renderDiagram(element);
      } catch (error) {
        element.dataset.error = String(error);
        element.querySelector('.diagram-status').textContent =
          'Diagram source is preserved below. Open the original guide for its repository rendering.';
        element.querySelector('details').open = true;
      }
    });
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            render(entry.target);
            observer.unobserve(entry.target);
          }
        }),
      { rootMargin: '400px' }
    );
    diagrams.forEach((diagram) => observer.observe(diagram));
  } else diagrams.forEach(render);
}

initSourceLab();

initWorkPlanner();
initAlphaMark();
