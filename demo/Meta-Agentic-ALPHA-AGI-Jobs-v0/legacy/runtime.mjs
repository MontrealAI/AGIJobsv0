import engine from 'mermaid';
import DOMPurify from 'dompurify';
import { displaySource } from '../../../website/assets/diagram-source.mjs';

function diagramSource(original) {
  let source = displaySource(original),
    index = 0;
  if (/^radarChart\s*$/m.test(source)) {
    source = source
      .replace(/^radarChart/m, 'radar-beta')
      .replace(/^(\s*)axes\s+/gm, '$1axis ')
      .replace(
        /^\s*dataset\s+([^\n]+)\n\s*data\s+([^\n]+)/gm,
        (_match, label, values) =>
          `  curve recorded["${label.trim()}"]{${values.trim()}}`
      );
    source += '\n  min 0\n  max 1';
  }
  if (/^quadrantChart\s*$/m.test(source)) {
    source = source
      .replace(/<--->/g, '-->')
      .replace(
        /^(\s*)title (.+)$/m,
        '$1title $2 (recorded coordinates -1 to 1)'
      )
      .replace(
        /^(\s*)"([^"]+)"\s*:\s*(-?[\d.]+)\s*:\s*(-?[\d.]+)\s*$/gm,
        (_match, indent, label, x, y) =>
          `${indent}"${label} (${x}, ${y})": [${(Number(x) + 1) / 2}, ${
            (Number(y) + 1) / 2
          }]`
      );
  }
  source = source.replace(/--\|([^|]*)\|-->/g, '-->|$1|');
  source = source.replace(
    /^(\s*)subgraph\s+([A-Za-z][A-Za-z0-9 _-]+)\s*$/gm,
    (line, indent, label) => {
      label = label.trim();
      if (!label.includes(' ')) return line;
      const id = 'preserved_group_' + index++;
      return `${indent}subgraph ${id}["${label}"]`;
    }
  );
  const groups = [
    ...source.matchAll(/subgraph (preserved_group_\d+)\["([^"]+)"\]/g),
  ];
  for (const [, id, label] of groups) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    source = source
      .replace(
        new RegExp(
          '(-->\\s*(?:\\|[^|]*\\|\\s*)?)' + escaped + '(?=\\s*$)',
          'gm'
        ),
        '$1' + id
      )
      .replace(
        new RegExp('^(\\s*)' + escaped + '(?=\\s+-->)', 'gm'),
        '$1' + id
      );
  }
  return source;
}

export const mermaid = {
  initialize(options = {}) {
    return engine.initialize({
      ...options,
      startOnLoad: false,
      securityLevel: 'strict',
      flowchart: { ...options.flowchart, htmlLabels: false },
    });
  },
  render: (id, source, ...args) =>
    engine.render(id, diagramSource(source), ...args),
  renderAsync: (id, source, ...args) =>
    engine.render(id, diagramSource(source), ...args),
  parse: (source) => engine.parse(diagramSource(source)),
  run: (options) => {
    for (const node of options.nodes)
      if (!node.querySelector('svg'))
        node.textContent = diagramSource(node.textContent);
    return engine.run(options);
  },
};
mermaid.initialize({ theme: 'dark' });
export function setHTML(element, value) {
  const wrappers = {
    TABLE: ['<table>', '</table>', 'table'],
    TR: ['<table><tbody><tr>', '</tr></tbody></table>', 'tr'],
    TBODY: ['<table><tbody>', '</tbody></table>', 'tbody'],
    THEAD: ['<table><thead>', '</thead></table>', 'thead'],
  };
  const wrap = wrappers[element.tagName];
  const fragment = DOMPurify.sanitize(
    wrap ? wrap[0] + String(value) + wrap[1] : String(value),
    {
      RETURN_DOM_FRAGMENT: true,
      ALLOWED_TAGS: [
        'details',
        'summary',
        'ol',
        'strong',
        'span',
        'p',
        'div',
        'table',
        'thead',
        'tbody',
        'tr',
        'td',
        'th',
        'code',
        'br',
        'li',
        'ul',
        'h2',
        'h3',
        'main',
        'section',
        'small',
        'em',
        'b',
      ],
      ALLOWED_ATTR: ['class', 'role', 'scope', 'aria-label'],
    }
  );
  const content = wrap ? fragment.querySelector(wrap[2]) : fragment;
  element.replaceChildren(...content.childNodes);
  for (const table of [
    ...(element.tagName === 'TABLE' ? [element] : []),
    ...element.querySelectorAll('table'),
  ]) {
    table.tabIndex = 0;
    table.setAttribute('aria-label', 'Scrollable recorded results');
  }
}
export function setDiagram(element, value) {
  element.innerHTML = DOMPurify.sanitize(String(value), {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'a', 'image'],
  });
}
export function safeHref(value) {
  const url = new URL(String(value), location.href);
  return url.origin === location.origin &&
    ['http:', 'https:'].includes(url.protocol)
    ? url.href
    : '#unavailable-artifact';
}
