class Markup {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export function html(strings, ...values) {
  const escape = (value) =>
    value instanceof Markup
      ? value.value
      : String(value ?? '').replace(
          /[&<>"']/g,
          (c) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;',
            }[c])
        );
  return new Markup(
    strings.reduce(
      (result, part, i) =>
        result + part + (i < values.length ? escape(values[i]) : ''),
      ''
    )
  );
}

export function assetPath(filename) {
  const base = document.documentElement.dataset.assetBase || './output';
  return `${base.replace(/\/$/, '')}/${filename}`;
}

export function prepareDiagram(source) {
  const display = source.replace(/\\n/g, '<br/>');
  return /^gantt\s*$/m.test(display)
    ? display.replace(/:\s*,\s*/g, ': ')
    : display;
}

export function appendDiagramSource(container, source) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'View original Mermaid source';
  const pre = document.createElement('pre');
  pre.textContent = source;
  details.append(summary, pre);
  container.append(details);
}

let renderer;
export function loadMermaid() {
  if (!renderer)
    renderer = new Promise((resolve, reject) => {
      if (window.mermaid) return resolve(window.mermaid);
      const script = document.createElement('script');
      script.src = assetPath('mermaid/mermaid.min.js');
      script.onload = () =>
        window.mermaid
          ? resolve(window.mermaid)
          : reject(new Error('Local Mermaid renderer unavailable'));
      script.onerror = () =>
        reject(
          new Error(
            'Local Mermaid renderer unavailable; regenerate the demo artifacts.'
          )
        );
      document.head.append(script);
    });
  return renderer;
}

export function showFailure(error) {
  const banner =
    document.querySelector('#demo-load-status') || document.createElement('p');
  banner.id = 'demo-load-status';
  banner.className = 'status-fail';
  banner.setAttribute('role', 'alert');
  banner.textContent = `Dashboard incomplete: ${
    error.message || error
  }. Run the selected profile’s orchestration command, then reload. No live action has been performed.`;
  if (!banner.isConnected) document.querySelector('header').append(banner);
  document.documentElement.dataset.demoStatus = 'failed';
}

export function showReady(telemetry) {
  const banner = document.querySelector('#demo-load-status');
  if (banner)
    banner.textContent = `Simulation snapshot: ${
      telemetry.manifest?.generatedAt || 'recorded fixture'
    } · values are model outputs, not current observations.`;
  document.documentElement.dataset.demoStatus = 'ready';
}
