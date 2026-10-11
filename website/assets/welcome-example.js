const guide = document.querySelector('#example');
if (guide) {
  const messages = JSON.parse(guide.dataset.messages);
  const panels = [...guide.querySelectorAll('[data-example-step]')];
  const progress = [...guide.querySelectorAll('[data-example-go]')];
  const next = document.querySelector('#example-next');
  const back = document.querySelector('#example-back');
  const result = document.querySelector('#example-result');
  const checks = [...guide.querySelectorAll('input[type="checkbox"]')];
  let step = 0;
  let reviewed = false;

  function show(index, focus = true) {
    step = index;
    panels.forEach((panel, i) => {
      panel.hidden = i !== step;
    });
    progress.forEach((link, i) => {
      if (i === step) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    back.hidden = step === 0;
    next.hidden = step === 2;
    next.textContent = messages.next[step] || '';
    if (focus) {
      history.replaceState(null, '', '#example-step-' + step);
      panels[step].querySelector('h2').focus();
    }
  }
  progress.forEach((link, i) =>
    link.addEventListener('click', (event) => {
      event.preventDefault();
      show(i);
    })
  );
  document
    .querySelector('.begin-example')
    .addEventListener('click', (event) => {
      event.preventDefault();
      panels[step].querySelector('h2').focus({ preventScroll: true });
      guide.scrollIntoView({ block: 'start' });
    });
  next.addEventListener('click', () => show(Math.min(2, step + 1)));
  back.addEventListener('click', () => show(Math.max(0, step - 1)));
  const versions = [...guide.querySelectorAll('[data-example-preview]')];
  function preview(version) {
    guide.querySelectorAll('[data-example-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.examplePanel !== version;
    });
    versions.forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.examplePreview === version)
      )
    );
  }
  versions.forEach((button) =>
    button.addEventListener('click', () =>
      preview(button.dataset.examplePreview)
    )
  );
  const checkButton = document.querySelector('#example-check');
  checkButton.addEventListener('click', () => {
    const count = checks.filter((check) => check.checked).length;
    result.textContent = (
      count === 0 ? messages.none : count === 3 ? messages.all : messages.some
    ).replace('{count}', String(count));
    reviewed = true;
  });
  checks.forEach((check) =>
    check.addEventListener('change', () => {
      if (reviewed) result.textContent = messages.changed;
      reviewed = false;
    })
  );
  const large = document.querySelector('#example-large-text');
  large.addEventListener('click', () => {
    const active = document.documentElement.classList.toggle('large-text');
    large.setAttribute('aria-pressed', String(active));
  });
  large.hidden = false;
  checkButton.hidden = false;
  document.querySelector('#example-versions').hidden = false;
  document.querySelector('.example-actions').hidden = false;
  preview('after');
  window.addEventListener('hashchange', () => {
    const target = /^#example-step-([0-2])$/.exec(location.hash);
    if (target) show(Number(target[1]));
  });
  const initial = /^#example-step-([0-2])$/.exec(location.hash);
  show(initial ? Number(initial[1]) : 0, false);
}
