import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { marked } from 'marked';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { build as bundle } from 'esbuild';
import { loadExperiences, renderExperience } from './experiences.mjs';
import { renderFeaturedDemos, renderHeroSpotlight } from './featured.mjs';

const require = createRequire(import.meta.url);
const { inventory } = require('../demo/catalog.cjs');
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        char
      ])
  );
const hash = (value) =>
  createHash('sha256').update(value).digest('hex').slice(0, 8);
const slug = (value) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'guide';
const encodePath = (value) =>
  value.split('/').map(encodeURIComponent).join('/');
const repo = 'https://github.com/MontrealAI/AGIJobsv0';
const themes = {
  settlement: 'Job settlement',
  learning: 'Learning & research',
  agents: 'Agents & applications',
  governance: 'Governance & validation',
  scale: 'Scale & orchestration',
  economics: 'Economic models',
  tools: 'Supporting tools',
};
const local = new Set([
  'aurora',
  'asi-takeoff',
  'asi-global',
  'atlas-conductor',
]);
const overrides = JSON.parse(
  fs.readFileSync(path.join(root, 'website/catalog-overrides.json'), 'utf8')
);
const window = new JSDOM('').window;
const purify = createDOMPurify(window);

export function basePath(value = '/AGIJobsv0/') {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value))
    throw new Error(
      'SITE_BASE_PATH must be an absolute directory path, e.g. /AGIJobsv0/'
    );
  return value;
}

export function makeCatalog(data = inventory(root)) {
  const used = new Set();
  return data.demos.map((demo) => {
    let id = slug(demo.name);
    if (used.has(id)) id += '-' + hash(demo.name);
    used.add(id);
    const supporting = demo.kind === 'Supporting code / assets';
    const [title, description, theme] = overrides[demo.name] || [
      demo.name.replace(/_/g, ' ').replace(/-/g, ' '),
      'Supporting modules and import-compatible source paths for the demo family. Open the repository directory to inspect their parent workflow.',
      'tools',
    ];
    if (!supporting && !overrides[demo.name])
      throw new Error('Add a catalog description for ' + demo.name);
    return {
      ...demo,
      id,
      title,
      description,
      theme,
      kindLabel: local.has(demo.name)
        ? 'Local chain'
        : demo.kind === 'Design guide'
        ? 'Design guide'
        : supporting
        ? 'Supporting code'
        : 'Code & guide',
      kindId: local.has(demo.name)
        ? 'local'
        : demo.kind === 'Design guide'
        ? 'design'
        : supporting
        ? 'support'
        : 'code',
    };
  });
}

export function renderMarkdown(
  source,
  sourcePath,
  { base, revision, guideRoutes, tracked, output, images }
) {
  const diagrams = [];
  const usedHeadings = new Map();
  const renderer = new marked.Renderer();
  renderer.heading = function (token) {
    const text = this.parser.parseInline(token.tokens);
    const plain = text
      .replace(/<[^>]*>/g, '')
      .replace(/&[^;]+;/g, '')
      .toLowerCase();
    const stem = plain.replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = usedHeadings.get(stem) || 0;
    usedHeadings.set(stem, count + 1);
    return `<h${token.depth} id="${escape(
      stem + (count ? '-' + count : '')
    )}">${text}</h${token.depth}>`;
  };
  renderer.code = ({ text, lang }) => {
    if (lang?.trim() === 'mermaid') {
      const id = `${hash(sourcePath)}-${diagrams.length}`;
      diagrams.push(text);
      return `<figure class="diagram" data-diagram="${id}"><figcaption class="diagram-status">Architecture diagram · source preserved below</figcaption><div class="diagram-viewport"></div><details><summary>View original Mermaid source</summary><pre><code>${escape(
        text
      )}</code></pre></details></figure>`;
    }
    return `<pre><code>${escape(text)}</code></pre>`;
  };
  const document = new JSDOM(
    purify.sanitize(marked.parse(source, { renderer, gfm: true }), {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
      FORBID_ATTR: ['style'],
    })
  ).window.document;
  function destination(raw) {
    if (!raw) return null;
    if (raw.startsWith('#')) return raw;
    if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return null;
    const match = raw.match(/^([^?#]*)([?#].*)?$/);
    let decoded;
    try {
      decoded = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(sourcePath), decoded)
    );
    if (target.startsWith('../') || target.startsWith('/')) return null;
    if (guideRoutes.has(target))
      return base + guideRoutes.get(target) + (match[2] || '');
    if (tracked.has(target))
      return `${repo}/blob/${revision}/${encodePath(target)}${match[2] || ''}`;
    if (
      [...tracked].some((file) =>
        file.startsWith(target.replace(/\/$/, '') + '/')
      )
    )
      return `${repo}/tree/${revision}/${encodePath(target)}`;
    return null;
  }
  for (const element of document.querySelectorAll('a')) {
    const href = destination(element.getAttribute('href'));
    if (href) {
      element.setAttribute('href', href);
      element.setAttribute('rel', 'noopener noreferrer');
    } else {
      element.removeAttribute('href');
      element.setAttribute(
        'title',
        'Local, generated, or unavailable repository target; consult the source guide.'
      );
    }
  }
  for (const element of document.querySelectorAll('pre, table')) {
    element.setAttribute('tabindex', '0');
    element.setAttribute(
      'aria-label',
      element.tagName === 'PRE' ? 'Scrollable code sample' : 'Scrollable table'
    );
  }
  for (const element of document.querySelectorAll('img')) {
    const raw = element.getAttribute('src') || '';
    let target;
    try {
      target = path.posix.normalize(
        path.posix.join(path.posix.dirname(sourcePath), decodeURIComponent(raw))
      );
    } catch {
      target = '';
    }
    if (tracked.has(target) && /\.(png|jpe?g|webp|gif|svg)$/i.test(target)) {
      const filename = `assets/images/${hash(target)}${path.extname(target)}`;
      if (output && !images.has(filename)) {
        fs.mkdirSync(path.join(output, 'assets/images'), { recursive: true });
        fs.copyFileSync(path.join(root, target), path.join(output, filename));
        images.add(filename);
      }
      element.src = base + filename;
      element.setAttribute('loading', 'lazy');
    } else {
      const label = document.createElement('span');
      label.className = 'media-label';
      label.textContent = element.getAttribute('alt') || 'Linked image';
      element.replaceWith(label);
    }
  }
  return { html: document.body.innerHTML, diagrams };
}

function chrome({
  title,
  description,
  base,
  revision,
  canonical = '',
  body,
  active = '',
}) {
  const href = (value) => base + value;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#0b0914"><meta name="description" content="${escape(
    description
  )}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="strict-origin-when-cross-origin"><title>${escape(
    title
  )} · AGI Jobs Demo Observatory</title><link rel="canonical" href="https://montrealai.github.io${href(
    canonical
  )}"><meta property="og:title" content="${escape(
    title
  )} · AGI Jobs"><meta property="og:description" content="${escape(
    description
  )}"><meta property="og:type" content="website"><link rel="icon" type="image/svg+xml" href="${href(
    'assets/favicon.svg'
  )}"><link rel="stylesheet" href="${href(
    'assets/site.css'
  )}"><script type="module" src="${href(
    'assets/site.js'
  )}"></script></head><body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="header-inner"><a class="brand" href="${base}" aria-label="AGI Jobs home"><span class="brand-mark" aria-hidden="true">✧</span><span>AGI <strong>JOBS</strong><small>DEMO OBSERVATORY</small></span></a><button id="menu-toggle" class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu <span aria-hidden="true">☰</span></button><nav id="site-nav" aria-label="Primary navigation"><a href="${href(
    '#featured'
  )}">Featured demos</a><a ${
    active === 'catalog' ? 'aria-current="page"' : ''
  } href="${href('#explore')}">Explore demos</a><a href="${href(
    '#walkthrough'
  )}">How it works</a><a href="${href(
    '#start'
  )}">Start locally</a><a class="nav-repo" href="${repo}">Repository <span aria-hidden="true">↗</span></a></nav></div></header>${body}<footer class="site-footer"><a class="brand footer-brand" href="${base}"><span class="brand-mark" aria-hidden="true">✧</span><span>AGI <strong>JOBS</strong><small>INTELLIGENCE. EVIDENCE. EXECUTION.</small></span></a><div><a href="${href(
    '#explore'
  )}">All demos</a><a href="${repo}/blob/main/demo/README.md">Repository guide ↗</a><a href="${repo}/actions">CI evidence ↗</a><a href="${repo}/blob/main/LICENSE">MIT license ↗</a></div><p>Open source by MONTREAL.AI · Built from <a href="${repo}/commit/${revision}">${revision.slice(
    0,
    8
  )}</a><br>Scenario names describe demonstrations and research ambitions. Read each guide for its execution scope.</p></footer><span id="copy-status" class="sr-only" role="status"></span></body></html>`;
}

function orbit() {
  return `<div class="orbit-art" aria-hidden="true"><div class="orbit-grid"></div><svg viewBox="0 0 600 540" class="orbit-svg"><defs><radialGradient id="planet"><stop stop-color="#714db9"/><stop offset=".55" stop-color="#271f40"/><stop offset="1" stop-color="#0c101e"/></radialGradient><linearGradient id="ring"><stop stop-color="#7661aa"/><stop offset=".5" stop-color="#d4b9ff"/><stop offset="1" stop-color="#678d99"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="9"/></filter></defs><circle cx="300" cy="265" r="160" fill="#7650b1" opacity=".13" filter="url(#glow)"/><circle cx="300" cy="265" r="127" fill="url(#planet)" stroke="#71568f" stroke-width=".8"/><g fill="none" stroke="#c4a7ea" opacity=".2"><ellipse cx="300" cy="265" rx="55" ry="127"/><ellipse cx="300" cy="265" rx="103" ry="127"/><ellipse cx="300" cy="265" rx="127" ry="41"/><ellipse cx="300" cy="265" rx="127" ry="86"/><path d="M173 265h254M300 138v254"/></g><ellipse cx="300" cy="265" rx="223" ry="87" fill="none" stroke="url(#ring)" stroke-width="1.5" transform="rotate(-29 300 265)"/><ellipse cx="300" cy="265" rx="237" ry="99" fill="none" stroke="#8c70b5" opacity=".25" transform="rotate(-29 300 265)"/><circle cx="300" cy="265" r="214" fill="none" stroke="#9d7ac5" stroke-dasharray="2 9" opacity=".22"/><g fill="#d9bdff"><circle cx="107" cy="348" r="5"/><circle cx="488" cy="177" r="5"/><circle cx="183" cy="129" r="4"/><circle cx="405" cy="415" r="4"/></g><g fill="#b8afd1" font-family="system-ui" font-size="10" letter-spacing="2"><text x="68" y="379">01 / MISSION</text><text x="422" y="146">02 / EXECUTION</text><text x="116" y="105">03 / VALIDATION</text><text x="375" y="445">04 / SETTLEMENT</text></g><g fill="#e5d4ff"><circle cx="52" cy="97" r="1.6"/><circle cx="546" cy="329" r="1.7"/><circle cx="441" cy="65" r="1"/><circle cx="191" cy="473" r="1"/><circle cx="524" cy="431" r="1.2"/></g></svg><div class="orbit-center"><span>THE WORK LIFECYCLE</span><strong>Proof before<br>settlement.</strong><small>Explore the system, one mission at a time.</small></div><div class="orbit-caption"><span class="status-dot"></span> Architecture, made inspectable <span>↗</span></div></div>`;
}

export async function buildSite(destination = path.join(root, 'build/pages')) {
  const base = basePath(process.env.SITE_BASE_PATH);
  const nodeVersion = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
  const npmVersion = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  ).packageManager.replace(/^npm@/, '');
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
  );
  const data = inventory(root),
    catalog = makeCatalog(data),
    images = new Set();
  for (const demo of catalog) {
    demo.guides = [...tracked]
      .filter(
        (file) => file.startsWith(demo.path + '/') && /\.(md|mmd)$/i.test(file)
      )
      .sort();
  }
  const experiences = loadExperiences(root, catalog, tracked);
  const output = path.resolve(destination);
  if (
    output === root ||
    !output.startsWith(path.join(root, 'build') + path.sep)
  )
    throw new Error(
      'Site output must be inside the repository build directory.'
    );
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(output, file)), { recursive: true });
    fs.writeFileSync(path.join(output, file), content);
  };
  const documents = [
    ...new Set([
      'README.md',
      'demo/README.md',
      'docs/START_HERE.md',
      'docs/production/readiness-2026-10-03.md',
      'docs/production/rehearsal.md',
      ...catalog.flatMap((demo) => demo.guides),
    ]),
  ].sort();
  const guideRoutes = new Map(
    documents.map((file) => [
      file,
      `guides/${slug(file.replace(/\.md$/i, ''))}-${hash(file)}.html`,
    ])
  );
  const ctx = { base, revision, guideRoutes, tracked, output, images };
  const sourceURL = (file, directory = false) =>
    `${repo}/${directory ? 'tree' : 'blob'}/${revision}/${encodePath(file)}`;
  const guideURL = (file) =>
    guideRoutes.has(file) ? base + guideRoutes.get(file) : undefined;
  const card = (demo, index) =>
    `<article class="demo-card" data-demo-card data-kind="${
      demo.kindId
    }" data-theme="${demo.theme}" data-search="${escape(
      [
        demo.title,
        demo.name,
        demo.description,
        themes[demo.theme],
        ...demo.commands,
      ]
        .join(' ')
        .toLowerCase()
    )}"><div class="card-top"><span class="card-number">${String(
      index + 1
    ).padStart(2, '0')}</span><span class="badge ${demo.kindId}">${
      demo.kindLabel
    }</span></div><span class="card-theme">${
      themes[demo.theme]
    }</span><h3><a href="${base}demos/${demo.id}/">${escape(
      demo.title
    )}</a></h3><p>${escape(
      demo.description
    )}</p><div class="card-bottom"><span>${
      demo.guides.length
        ? demo.guides.length + (demo.guides.length === 1 ? ' guide' : ' guides')
        : 'Source directory'
    }</span><span aria-hidden="true">↗</span></div></article>`;
  const featured = ['aurora', 'Tiny-Recursive-Model-v0', 'CULTURE-v0'].map(
    (name) => catalog.find((demo) => demo.name === name)
  );
  const featureHTML = featured
    .map(
      (demo, index) =>
        `<a class="feature feature-${index}" href="${base}demos/${
          demo.id
        }/"><span class="feature-label">${
          [
            '01 / YOUR FIRST JOB',
            '02 / RECURSIVE LEARNING',
            '03 / COLLECTIVE EVOLUTION',
          ][index]
        }</span><div class="feature-art" aria-hidden="true">${
          index === 0
            ? '<i></i><i></i><i></i><i></i><b>01 → 04</b>'
            : index === 1
            ? '<i></i><i></i><i></i><i></i><b>↻</b>'
            : '<i></i><i></i><i></i><i></i><b>✧</b>'
        }</div><span class="feature-content"><span class="badge ${
          demo.kindId
        }">${demo.kindLabel}</span><strong>${
          demo.title
        }<span aria-hidden="true">↗</span></strong><span>${
          demo.description
        }</span></span></a>`
    )
    .join('');
  const scenarios = [
    {
      name: 'AURORA · Flagship job',
      specPath: 'demo/aurora/config/aurora.spec@v2.json',
    },
  ];
  for (const name of ['asi-global', 'atlas-conductor']) {
    const mission = JSON.parse(
      fs.readFileSync(
        path.join(root, `demo/${name}/config/mission@v2.json`),
        'utf8'
      )
    );
    for (const job of mission.jobs)
      scenarios.push({
        name: `${name === 'asi-global' ? 'Global' : 'Atlas'} · ${job.name}`,
        specPath: job.specPath,
      });
  }
  const options = scenarios
    .map((job) => {
      const spec = JSON.parse(
        fs.readFileSync(path.join(root, job.specPath), 'utf8')
      );
      return `<option value="${escape(job.specPath)}" data-k="${
        spec.validation.k
      }" data-n="${spec.validation.n}">${escape(job.name)}</option>`;
    })
    .join('');
  const steps = ['Define', 'Submit', 'Validate', 'Settle']
    .map(
      (label, i) =>
        `<li data-stage="${i}"><span class="stage-index">0${
          i + 1
        }</span><strong>${label}</strong><span class="stage-status">Waiting</span></li>`
    )
    .join('');
  const setup = `git clone https://github.com/MontrealAI/AGIJobsv0.git\ncd AGIJobsv0\nnvm install\nnvm use\nnpm ci\nnpm run demo:aurora:local`;
  const body = `<main id="main"><section class="hero section-wrap"><div class="hero-copy"><p class="eyebrow"><span></span> AGI JOBS / THE DEMO OBSERVATORY</p><h1>Intelligence,<br><em>put to work.</em></h1><p class="hero-description">Explore the systems that turn a mission into evidence, validation and settlement. From one local job to the frontiers of coordinated intelligence.</p><div class="hero-actions"><a class="button primary" href="#explore">Explore the demos <span aria-hidden="true">↗</span></a><a class="text-link" href="#walkthrough"><span class="play-icon" aria-hidden="true">▷</span> See how a job works</a></div><p class="hero-note">Open source. Inspectable. Start without a wallet.</p>${renderHeroSpotlight(
    base
  )}</div>${orbit()}</section>${renderFeaturedDemos(
    base,
    catalog
  )}<div class="metric-strip section-wrap"><div><strong>${
    catalog.length
  }<span> /</span></strong><span>catalog entries</span></div><div><strong>${
    Object.keys(data.commands).length
  }<span> /</span></strong><span>registered demo commands</span></div><div><strong>04<span> /</span></strong><span>local settlement starting points</span></div><a href="${repo}/actions/workflows/demo-gallery.yml"><span class="status-dot"></span><span>Evidence you can inspect<small>View the current demo test runs ↗</small></span></a></div><section class="section-wrap section" aria-labelledby="first-title"><div class="section-heading"><div><p class="eyebrow">A GOOD PLACE TO BEGIN</p><h2 id="first-title">Choose your first discovery.</h2></div><p>Three ways into the system.<br>One clear next step in every guide.</p></div><div class="feature-grid">${featureHTML}</div></section><section id="explore" class="section-wrap section" aria-labelledby="catalog-title"><div class="section-heading"><div><p class="eyebrow">THE COMPLETE COLLECTION</p><h2 id="catalog-title">Follow your curiosity.</h2></div><p>Every demo, design guide and supporting directory.<br>Original names and source remain one click away.</p></div><div class="catalog-controls"><div class="search-field"><label for="catalog-search">Search the collection</label><div><span aria-hidden="true">⌕</span><input id="catalog-search" type="search" placeholder="Try governance, learning, AURORA…" autocomplete="off"></div></div><div><label for="catalog-theme">Theme</label><select id="catalog-theme"><option value="">All themes</option>${Object.entries(
    themes
  )
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join(
      ''
    )}</select></div><div><label for="catalog-type">Experience</label><select id="catalog-type"><option value="">All experiences</option><option value="local">Local chain</option><option value="code">Code & guide</option><option value="design">Design guide</option><option value="support">Supporting code</option></select></div></div><div class="catalog-meta"><p id="catalog-count" role="status">${
    catalog.length
  } entries</p><button id="catalog-reset" class="text-button" type="button">Clear filters</button></div><noscript><p class="notice">All entries are listed below. Enable JavaScript to search, filter and use the interactive walkthrough.</p></noscript><div class="demo-grid">${catalog
    .map(card)
    .join(
      ''
    )}</div><div id="catalog-empty" class="empty-state" hidden><h3>No matching discoveries yet.</h3><p>Try a shorter search, select another theme, or clear the filters.</p></div><div class="catalog-pagination"><button id="catalog-more" class="button secondary" type="button" hidden>Show more demos <span aria-hidden="true">↓</span></button></div></section><section id="walkthrough" class="walkthrough-section section" aria-labelledby="walkthrough-title"><div class="section-wrap"><div class="section-heading"><div><p class="eyebrow">UNDERSTAND THE LIFECYCLE</p><h2 id="walkthrough-title">Evidence opens the next door.</h2></div><p>An interactive, browser-only illustration.<br>No wallet. No transaction. No installation.</p></div><div class="walkthrough-grid"><div class="walkthrough-inputs"><span class="badge design">Illustrative simulation</span><h3>Make a mission your own.</h3><noscript><p class="notice">Enable JavaScript to try this illustration, or follow the linked local contract guide.</p></noscript><label for="scenario">Scenario from the repository</label><select id="scenario">${options}</select><p id="scenario-detail" class="muted"></p><label class="checkbox-label"><input id="evidence" type="checkbox" checked> Worker includes the required evidence</label><label for="vote">Validator outcome</label><select id="vote"><option value="approve">All selected validators approve</option><option value="reject">Validators reject the result</option><option value="incomplete">Validation is incomplete</option></select><p class="muted">Choose inputs before starting. Reset to explore another outcome. This illustration omits live escrow, commit/reveal timing, disputes and fees.</p><a class="text-link" href="${base}demos/aurora/">Run the actual local contract workflow ↗</a></div><div class="walkthrough-console"><div class="console-heading"><span class="status-dot"></span> MISSION WALKTHROUGH <span>BROWSER ONLY</span></div><ol class="lifecycle">${steps}</ol><div class="walkthrough-output" role="status"><span class="eyebrow">CURRENT STATE</span><h3 id="walkthrough-status">Ready to explore</h3><p id="walkthrough-detail">Follow a mission through four illustrated stages.</p></div><div class="walkthrough-actions"><button id="walkthrough-next" class="button primary" type="button" disabled>Define the mission →</button><button id="walkthrough-reset" class="text-button" type="button">Reset</button></div><button id="walkthrough-download" class="download-button" type="button" disabled>Download simulation receipt ↓</button><p id="download-status" class="sr-only" role="status"></p></div></div></div></section><section id="start" class="section-wrap section" aria-labelledby="start-title"><div class="start-grid"><div><p class="eyebrow">FROM EXPLORATION TO EXECUTION</p><h2 id="start-title">Your first real<br>local mission.</h2><p class="section-description">Clone the repository, use the pinned toolchain, then complete one AURORA job on a disposable blockchain.</p><a class="text-link" href="${guideURL(
    'docs/START_HERE.md'
  )}">Open the complete setup guide ↗</a><ul class="start-notes"><li>Node ${escape(
    nodeVersion
  )} · npm ${escape(
    npmVersion
  )} · Git and nvm</li><li>Mock tokens and local test identities</li><li>Transactions and receipts you can inspect</li><li>Owned node shuts down when the run finishes</li></ul></div><div class="terminal"><div class="terminal-bar"><span><i></i><i></i><i></i></span><span>YOUR TERMINAL</span><button class="text-button" type="button" data-copy="setup-command">Copy</button></div><pre tabindex="0" aria-label="Local setup commands"><code id="setup-command">${escape(
    setup
  )}</code></pre><div class="terminal-note"><span class="status-dot"></span> First compilation can take several minutes.</div><p>Find the report in <code>reports/localhost/aurora/</code>. If port 8545 is in use, run with <code>DEMO_PORT=18545</code>.</p></div></div></section><section class="section-wrap evidence-section" aria-labelledby="evidence-title"><div><p class="eyebrow">READ THE EVIDENCE CORRECTLY</p><h2 id="evidence-title">Ambitious by design.<br>Precise about proof.</h2></div><div><p>Local-chain demos execute actual contracts with mock tokens and synthetic work. Research demos explore models under stated assumptions. Design guides preserve architecture and vision.</p><p>Successful tests establish the behavior they check. Live production requires authorized signing, provider validation, independent security review and target-network commissioning.</p><div class="inline-links"><a href="${guideURL(
    'docs/production/readiness-2026-10-03.md'
  )}">Production readiness ↗</a><a href="${guideURL(
    'docs/production/rehearsal.md'
  )}">Rehearsal guide ↗</a></div></div></section></main>`;
  write(
    'index.html',
    chrome({
      title: 'Intelligence, put to work',
      description:
        'Explore the complete AGI Jobs demo collection: local settlement, learning systems, governance and large-scale coordination, with original guides and flowcharts.',
      base,
      revision,
      body,
    })
  );
  const flowSources = [];
  for (const file of documents) {
    const originalSource = fs.readFileSync(path.join(root, file), 'utf8');
    const source = file.endsWith('.mmd')
      ? '````mermaid\n' + originalSource.trimEnd() + '\n````'
      : originalSource;
    const title =
      source.match(/^#\s+(.+)$/m)?.[1].replace(/[*`]/g, '') ||
      path.basename(file);
    const rendered = renderMarkdown(source, file, ctx);
    const owner = catalog.find((demo) => demo.guides.includes(file));
    const headingDocument = new JSDOM(rendered.html).window.document;
    const headings = [...headingDocument.querySelectorAll('h2[id],h3[id]')];
    const contents =
      headings.length > 2
        ? '<nav class="guide-contents" aria-label="Guide contents"><details open><summary>In this guide</summary><ol>' +
          headings
            .map(
              (h) =>
                '<li><a href="#' +
                escape(h.id) +
                '">' +
                escape(h.textContent) +
                '</a></li>'
            )
            .join('') +
          '</ol></details></nav>'
        : '';
    const guideBody = `<main id="main" class="section-wrap guide-layout"><div class="breadcrumb"><a href="${base}">Home</a><span>/</span>${
      owner
        ? `<a href="${base}demos/${owner.id}/">${escape(owner.title)}</a>`
        : '<a href="' + base + '#start">Documentation</a>'
    }<span>/</span><span>Original guide</span></div><div class="guide-toolbar"><p>Repository guide · ${
      rendered.diagrams.length
    } ${
      rendered.diagrams.length === 1 ? 'diagram' : 'diagrams'
    }</p><a href="${sourceURL(
      file
    )}">View source on GitHub ↗</a></div><div class="guide-context">Original documentation, preserved from the repository. Historical projections and scenario ambitions are not evidence of live performance. See the <a href="${guideURL(
      'docs/production/readiness-2026-10-03.md'
    )}">current readiness record</a> for deployment requirements.</div>${contents}<article class="prose">${
      rendered.html
    }</article><a class="button secondary back-button" href="${
      owner ? base + 'demos/' + owner.id + '/' : base + '#explore'
    }">← Back to ${owner ? escape(owner.title) : 'the collection'}</a></main>`;
    write(
      guideRoutes.get(file),
      chrome({
        title,
        description: `Preserved repository guide: ${title}`,
        base,
        revision,
        body: guideBody,
        canonical: guideRoutes.get(file),
      })
    );
    flowSources.push({
      file,
      count: rendered.diagrams.length,
      sha256: createHash('sha256')
        .update(JSON.stringify(rendered.diagrams))
        .digest('hex'),
    });
  }
  for (const demo of catalog) {
    const commands = demo.commands.filter(
      (command) => !/:(?:mainnet|sepolia|deploy|apply)(?:$|:)/.test(command)
    );
    const notes =
      demo.kindId === 'local'
        ? 'Runs actual contracts on a disposable localhost chain using mock tokens and synthetic work. Read the setup guide first.'
        : demo.kindId === 'design'
        ? 'This directory is a design guide. Its original architecture is preserved, with links in the guide to related executable demonstrations.'
        : demo.kindId === 'support'
        ? 'This directory contains supporting modules, aliases, tests or assets. Open its source directory to find the parent workflow.'
        : 'This directory includes code and documentation. Its guide defines dependencies, execution modes and what the results demonstrate.';
    const demoBody = `<main id="main" class="section-wrap demo-detail"><div class="breadcrumb"><a href="${base}">Home</a><span>/</span><a href="${base}#explore">Demo collection</a><span>/</span><span>${escape(
      demo.title
    )}</span></div><div class="detail-hero"><div><p class="eyebrow">${
      themes[demo.theme]
    }</p><h1>${escape(demo.title)}</h1><p class="section-description">${escape(
      demo.description
    )}</p><div class="hero-actions"><a class="button primary" href="#guided-tour">Explore this demo ↓</a>${
      demo.readme
        ? `<a class="button secondary" href="${guideURL(
            demo.readme
          )}">Read the full guide ↗</a>`
        : ''
    }<a class="button secondary" href="${sourceURL(
      demo.path,
      true
    )}">Explore the source ↗</a></div></div><aside class="detail-facts"><span class="badge ${
      demo.kindId
    }">${
      demo.kindLabel
    }</span><h2>What to expect</h2><p>${notes}</p><dl><div><dt>Guides & runbooks</dt><dd>${
      demo.guides.length
    }</dd></div><div><dt>Registered commands</dt><dd>${
      demo.commands.length
    }</dd></div></dl><a href="${guideURL(
      'docs/START_HERE.md'
    )}">Environment setup ↗</a></aside></div>${renderExperience(
      demo,
      experiences[demo.name],
      {
        root,
        base,
        revision,
        sourceURL,
        guideURL,
        catalog,
        tracked,
        write,
        renderMarkdown: (source, file) => renderMarkdown(source, file, ctx),
      }
    )}<div id="library" class="detail-grid"><section><p class="eyebrow">EVERY VARIANT, PRESERVED</p><h2>Complete document library</h2>${
      demo.guides.length
        ? '<ul class="guide-list">' +
          demo.guides
            .map(
              (file) =>
                `<li><a href="${guideURL(file)}"><span>${escape(
                  file.slice(demo.path.length + 1)
                )}</span><span aria-hidden="true">↗</span></a></li>`
            )
            .join('') +
          '</ul>'
        : `<p class="muted">No standalone guide is tracked in this supporting directory. <a href="${sourceURL(
            demo.path,
            true
          )}">Inspect its source</a>.</p>`
    }</section><section><p class="eyebrow">REPRODUCE & INSPECT</p><h2>Registered commands</h2><p class="muted">Run commands from the repository root after following this demo's guide. Network and owner actions require their documented setup.</p>${
      commands.length
        ? commands
            .map(
              (command, i) =>
                `<div class="command-row"><code id="command-${i}">npm run ${escape(
                  command
                )}</code><button class="text-button" type="button" data-copy="command-${i}">Copy</button></div>`
            )
            .join('')
        : '<p>No root-level launch command is associated with this source path. Follow the guide or source directory for its own entry point.</p>'
    }<p><a href="${guideURL(
      'demo/README.md'
    )}">Full command catalog and troubleshooting ↗</a></p></section></div><div class="source-path"><span>ORIGINAL DIRECTORY</span><code>${escape(
      demo.path
    )}</code><a href="${sourceURL(
      demo.path,
      true
    )}">View on GitHub ↗</a></div></main>`;
    write(
      `demos/${demo.id}/index.html`,
      chrome({
        title: demo.title,
        description: demo.description,
        base,
        revision,
        body: demoBody,
        canonical: `demos/${demo.id}/`,
        active: 'catalog',
      })
    );
  }
  write(
    '404.html',
    chrome({
      title: 'Find your next discovery',
      description: 'Return to the AGI Jobs demo collection.',
      base,
      revision,
      body: `<main id="main" class="section-wrap not-found"><p class="eyebrow">404 / UNCHARTED COORDINATES</p><h1>Let’s get you<br>back on course.</h1><p>This page could not be found. All demos and guides are available from the collection.</p><a class="button primary" href="${base}#explore">Explore the collection ↗</a></main>`,
      canonical: '404.html',
    })
  );
  write('.nojekyll', '');
  write(
    'assets/favicon.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#171023"/><path d="M32 8l6 18 18 6-18 6-6 18-6-18-18-6 18-6z" fill="#c9a5ff"/></svg>'
  );
  fs.copyFileSync(
    path.join(root, 'website/assets/site.css'),
    path.join(output, 'assets/site.css')
  );
  await bundle({
    entryPoints: [path.join(root, 'website/assets/site.js')],
    outdir: path.join(output, 'assets'),
    bundle: true,
    splitting: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    legalComments: 'linked',
    logLevel: 'warning',
  });
  const deckRoot = 'demo/AGI-Jobs-Platform-at-Kardashev-II-Scale/';
  const dashboardRoutes = [];
  for (const file of tracked) {
    if (!file.startsWith(deckRoot)) continue;
    const relative = file.slice(deckRoot.length);
    if (
      /^(?:(?:stellar-civilization-lattice|k2-stellar-demo)\/)?(?:index\.html|README\.md|ui\/|output\/)/.test(
        relative
      )
    ) {
      write(
        'experiments/kardashev-ii/' + relative,
        fs.readFileSync(path.join(root, file))
      );
      if (relative.endsWith('index.html'))
        dashboardRoutes.push(
          'experiments/kardashev-ii/' + relative.slice(0, -10)
        );
    }
  }
  // Publish the same offline Business 3 planner used by the local viewer.
  const businessRoot =
    'demo/kardashev_ii_omega_grade_alpha_agi_business_3/workbench/';
  for (const asset of [
    'index.html',
    'styles.css',
    'app.mjs',
    'core.mjs',
    'catalog.mjs',
    'architecture.svg',
  ]) {
    const file = businessRoot + asset;
    if (!tracked.has(file))
      throw new Error('Missing Business 3 workbench asset: ' + file);
    write(
      'experiments/kardashev-business/' + asset,
      fs.readFileSync(path.join(root, file))
    );
  }
  dashboardRoutes.push('experiments/kardashev-business/');
  // Publish the complete OmniSovereign rehearsal with only local assets.
  for (const asset of [
    'index.html',
    'styles.css',
    'app.mjs',
    'model.mjs',
    'execute.mjs',
    'review.mjs',
    'scenario.json',
    'project-plan.omnisovereign.json',
    'architecture.svg',
  ]) {
    const file = 'demo/omnisovereign/' + asset;
    if (!tracked.has(file))
      throw new Error('Missing OmniSovereign asset: ' + file);
    write(
      'experiments/omnisovereign/' + asset,
      fs.readFileSync(path.join(root, file))
    );
  }
  dashboardRoutes.push('experiments/omnisovereign/');
  const { buildSite: buildMetaAgenticSite } = await import(
    '../../demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/scripts/build-site.mjs'
  );
  fs.rmSync(path.join(output, 'experiments/meta-agentic-alpha'), {
    recursive: true,
    force: true,
  });
  const metaAgenticSite = await buildMetaAgenticSite(
    path.join(output, 'experiments/meta-agentic-alpha')
  );
  dashboardRoutes.push('experiments/meta-agentic-alpha/');
  const archiveRoutes = metaAgenticSite.archiveRoutes.map(
    (route) => 'experiments/meta-agentic-alpha/' + route
  );
  const { buildSite: buildHgmSite } = await import(
    '../../demo/Huxley-Godel-Machine-v0/scripts/build_site.mjs'
  );
  await buildHgmSite(path.join(output, 'experiments/huxley-godel'));
  dashboardRoutes.push('experiments/huxley-godel/');
  archiveRoutes.push('experiments/huxley-godel/legacy/');
  // Compile the same Studio shipped in the pnpm workspace, in explicit offline mode.
  const studio = path.join(root, 'demo/CULTURE-v0/apps/culture-studio');
  execFileSync(
    process.execPath,
    [
      path.join(studio, 'node_modules/vite/bin/vite.js'),
      'build',
      '--base',
      './',
      '--outDir',
      path.join(output, 'experiments/culture'),
    ],
    {
      cwd: studio,
      env: { ...process.env, VITE_DEMO_MODE: 'true' },
      stdio: 'pipe',
    }
  );
  const studioIndex = path.join(output, 'experiments/culture/index.html');
  const csp =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";
  fs.writeFileSync(
    studioIndex,
    fs
      .readFileSync(studioIndex, 'utf8')
      .replace(
        '<head>',
        `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`
      )
  );
  // Publish the same One-Box console, with an explicit offline boundary.
  execFileSync(
    process.execPath,
    [path.join(root, 'apps/onebox-static/scripts/build.mjs')],
    { cwd: root, stdio: 'pipe' }
  );
  const oneboxDirectory = path.join(output, 'experiments/one-box');
  fs.cpSync(path.join(root, 'apps/onebox-static/dist'), oneboxDirectory, {
    recursive: true,
  });
  const oneboxIndex = path.join(oneboxDirectory, 'index.html');
  fs.writeFileSync(
    oneboxIndex,
    fs
      .readFileSync(oneboxIndex, 'utf8')
      .replace(/connect-src [^;]+;/, "connect-src 'none';")
      .replace('</head>', '<meta name="onebox-demo" content="true"></head>')
  );
  const manifest = {
    schemaVersion: 2,
    oneboxRoute: 'experiments/one-box/',

    cultureStudioRoute: 'experiments/culture/',
    dashboardRoutes,
    archiveRoutes,
    experiences: Object.keys(experiences).length,
    sourceInspections: new Set(
      Object.values(experiences).flatMap((p) => p.steps.map((s) => s.source))
    ).size,
    revision,
    basePath: base,
    directories: catalog.length,
    registeredCommands: Object.keys(data.commands).length,
    guides: documents.length,
    diagrams: flowSources.reduce((sum, item) => sum + item.count, 0),
    catalog,
    guideRoutes: Object.fromEntries(guideRoutes),
    diagramSources: flowSources,
  };
  write('catalog.json', JSON.stringify(manifest, null, 2) + '\n');
  write(
    'robots.txt',
    `User-agent: *\nAllow: /\nSitemap: https://montrealai.github.io${base}sitemap.xml\n`
  );
  const routes = [
    '',
    ...dashboardRoutes,
    ...archiveRoutes,
    'experiments/culture/',
    'experiments/one-box/',
    ...catalog.map((demo) => `demos/${demo.id}/`),
    ...guideRoutes.values(),
  ];
  write(
    'sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes
      .map(
        (route) =>
          `<url><loc>https://montrealai.github.io${base}${route}</loc></url>`
      )
      .join('')}</urlset>`
  );
  console.log(
    `Built ${catalog.length} demo pages, ${documents.length} guides and ${manifest.diagrams} preserved diagrams at ${output}`
  );
  return manifest;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await buildSite();
