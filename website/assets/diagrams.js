import mermaid from 'mermaid';
import { displaySource } from './diagram-source.mjs';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'dark',
  suppressErrorRendering: true,
  maxTextSize: 200000,
  themeVariables: {
    fontFamily: 'system-ui, sans-serif',
    primaryColor: '#30214a',
    primaryTextColor: '#f4f0ff',
    primaryBorderColor: '#ac88f4',
    lineColor: '#bba9d6',
    background: '#111022',
  },
});

export const validateDiagram = (source) => mermaid.parse(displaySource(source));

export async function renderDiagram(element) {
  const source = element.querySelector('code').textContent;
  const displayed = displaySource(source);
  const { svg } = await mermaid.render(
    `flow-${element.dataset.diagram}`,
    displayed
  );
  const viewport = element.querySelector('.diagram-viewport');
  viewport.innerHTML = svg;
  viewport.setAttribute('tabindex', '0');
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Scrollable architecture diagram');
  element.querySelector('.diagram-status').textContent =
    displayed === source
      ? 'Original architecture diagram · scroll horizontally when needed'
      : 'Original architecture · label quoting adapted for display; source preserved below';
  element.dataset.rendered = 'true';
}
