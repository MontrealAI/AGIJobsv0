import mermaid from 'mermaid';
import { displaySources, relativeSchedule } from './diagram-source.mjs';

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
const esc = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
function scheduleSVG(schedule) {
  const { title, tasks } = schedule;
  const durationOnly = tasks.some((t) => t.start === null);
  const maximum = Math.max(1, ...tasks.map((t) => (t.start ?? 0) + t.duration));
  const height = 130 + tasks.length * 68;
  const barStart = 380,
    barWidth = 460;
  const subtitle = durationOnly
    ? 'Duration comparison · start times are not specified in the source'
    : 'Relative schedule · hours from the scenario start (no calendar dates)';
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const x = barStart + (i * barWidth) / 4;
    return `<line x1="${x}" x2="${x}" y1="85" y2="${
      height - 30
    }" stroke="#40344f"/><text x="${x}" y="77" fill="#c9bbda" font-size="11" text-anchor="middle">${Number(
      ((maximum * i) / 4).toFixed(2)
    )} h</text>`;
  }).join('');
  const rows = tasks
    .map((t, i) => {
      const y = 110 + i * 68;
      return `<text x="20" y="${y}" fill="#e9def5" font-size="11">${esc(
        t.label.replace(/_+/g, ' ')
      )}</text><text x="20" y="${y + 20}" fill="#b5aac4" font-size="10">${esc(
        t.start === null ? 'Start unspecified' : `Start ${t.start} h`
      )} · duration ${t.duration} h</text><rect x="${
        barStart + ((t.start ?? 0) / maximum) * barWidth
      }" y="${y - 10}" width="${
        (t.duration / maximum) * barWidth
      }" height="24" rx="4" fill="#ae88df"/><text x="${
        barStart +
        ((t.start ?? 0) / maximum) * barWidth +
        (t.duration / maximum) * barWidth +
        6
      }" y="${y + 7}" fill="#dceee5" font-size="10">${t.duration} h</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 ${height}" width="920" role="img" aria-label="${esc(
    title
  )}"><title>${esc(title)}. ${esc(
    subtitle
  )}</title><text x="20" y="25" fill="#f2e8ff" font-family="system-ui" font-size="17">${esc(
    title
  )}</text><text x="20" y="49" fill="#c7bbd5" font-family="system-ui" font-size="11">${esc(
    subtitle
  )}</text><g font-family="system-ui">${ticks}${rows}</g></svg>`;
}
export async function validateDiagram(source) {
  if (relativeSchedule(source)) return true;
  for (const displayed of displaySources(source))
    await mermaid.parse(displayed);
  return true;
}
export async function renderDiagram(element) {
  const source = element.querySelector('code').textContent;
  const schedule = relativeSchedule(source);
  const displayed = displaySources(source);
  const viewport = element.querySelector('.diagram-viewport');
  const svgs = [];
  if (schedule) svgs.push(scheduleSVG(schedule));
  else
    for (const [index, part] of displayed.entries()) {
      const { svg } = await mermaid.render(
        `flow-${element.dataset.diagram}-${index}`,
        part
      );
      svgs.push(svg);
    }
  viewport.innerHTML = svgs.join('\n');
  viewport.setAttribute('tabindex', '0');
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Scrollable architecture diagram');
  element.querySelector('.diagram-status').textContent = schedule
    ? 'Original schedule values · relative hours shown without invented calendar dates; source preserved below'
    : displayed.length === 1 && displayed[0] === source
    ? 'Original architecture diagram · scroll horizontally when needed'
    : 'Original diagram content · legacy syntax or layout adapted for display; source preserved below';
  element.dataset.rendered = 'true';
}
