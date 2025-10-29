(function () {
  'use strict';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const activateStep = (step) => {
    document.querySelectorAll('[data-step]').forEach((el) => {
      if (Number(el.getAttribute('data-step')) === step) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  };

  async function cycleSteps() {
    const steps = Array.from(document.querySelectorAll('[data-step]'));
    if (steps.length === 0) return;
    let index = 0;
    while (true) {
      const stepNumber = Number(steps[index % steps.length].getAttribute('data-step'));
      activateStep(stepNumber);
      const paceRaw = document.body.dataset.pace;
      const paceMs = Number(paceRaw || 2000);
      // eslint-disable-next-line no-await-in-loop
      await sleep(paceMs);
      index += 1;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const paceEnv = Number(new URLSearchParams(window.location.search).get('pace'));
    if (!Number.isNaN(paceEnv) && paceEnv > 0) {
      document.body.dataset.pace = paceEnv;
    } else {
      const paceFromEnv = Number(window.localStorage.getItem('hgm-guided-pace'));
      if (paceFromEnv > 0) {
        document.body.dataset.pace = paceFromEnv;
      }
    }

    if (window.mermaid) {
      window.mermaid.initialize({ startOnLoad: true, theme: 'dark' });
    }

    cycleSteps().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to animate storyline', err);
    });
  });
})();
