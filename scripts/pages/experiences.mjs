import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]
  );
const setups = {
  local: [
    'Disposable local chain',
    'From the repository root, use nvm install, nvm use and npm ci with the pinned Node/npm versions. The local driver uses mock assets; its owned development node stops at the end. If port 8545 is occupied, use DEMO_PORT=18545.',
  ],
  node: [
    'Node.js workspace',
    'Run from the repository root after nvm install, nvm use and npm ci. Use the versions pinned in .nvmrc and package.json. Commands below describe the selected path; optional app/server packages can have their own locked dependencies.',
  ],
  configured: [
    'Configured operator environment',
    'Start with the linked setup and component runbooks. This experience crosses several services or network-aware scripts; the first command below is labeled with its actual scope. Prepare local addresses, services and output paths before invoking the broader launcher.',
  ],
  stdlib: [
    'Python, no demo package install',
    'Run from the repository root with Python 3.12. This selected entry point uses the Python standard library. Keep output in a separate directory so that you can compare runs.',
  ],
  python: [
    'Isolated Python environment',
    'Use Python 3.12 in a virtual environment. Install this demo’s tracked requirements file when present, then run python -m pip check. Some variants have additional requirements: follow the selected implementation’s guide, not an unrelated demo’s dependency list.',
  ],
  trm: [
    'Python + CPU model dependencies',
    'Use Python 3.12 in an isolated environment. Install demo/Tiny-Recursive-Model-v0/requirements-core.txt with --extra-index-url https://download.pytorch.org/whl/cpu, then run python -m pip check. The optional dashboard has a separate dependency profile.',
  ],
  culture: [
    'Docker + pinned pnpm workspace',
    'Install Docker with Compose, use the repository’s Node version and the pnpm version in this demo’s package.json. Run the commands below in a terminal from the repository root; they then enter the CULTURE workspace.',
  ],
  design: [
    'Architecture reading path',
    'No standalone executable exists in this directory. Follow the related implementation below for an executable experience and its own prerequisites.',
  ],
  support: [
    'Supporting material',
    'This entry supports another demo or the collection as a whole. Use the canonical experience for execution; preserve the compatibility layer or presentation asset when making changes.',
  ],
};

export function loadExperiences(root, catalog, tracked) {
  const profiles = JSON.parse(
    fs.readFileSync(path.join(root, 'website/demo-experiences.json'), 'utf8')
  );
  const names = new Set(catalog.map((d) => d.name));
  if (
    Object.keys(profiles).length !== names.size ||
    Object.keys(profiles).some((n) => !names.has(n))
  )
    throw new Error('Experiences must cover the exact demo inventory.');
  for (const demo of catalog) {
    const p = profiles[demo.name];
    if (
      !p ||
      !setups[p.mode] ||
      p.steps?.length < 3 ||
      !p.question ||
      !p.purpose ||
      !p.expected ||
      !p.experiment
    )
      throw new Error(`Incomplete experience: ${demo.name}`);
    for (const step of p.steps)
      if (!tracked.has(step.source) || !step.title || !step.explanation)
        throw new Error(
          `Missing experience source: ${demo.name}: ${step.source}`
        );
    for (const deck of p.dashboards || [])
      if (
        !/^experiments\/[a-z0-9/-]+\/$/.test(deck.route) ||
        !deck.title ||
        !tracked.has(deck.source)
      )
        throw new Error(`Invalid dashboard route: ${demo.name}`);
    for (const related of p.related)
      if (!names.has(related))
        throw new Error(`Missing related demo: ${related}`);
    if (!p.command && !['support', 'design'].includes(p.mode))
      throw new Error(`Missing execution path: ${demo.name}`);
  }
  return profiles;
}

export function renderExperience(demo, profile, ctx) {
  const {
    root,
    base,
    revision,
    sourceURL,
    guideURL,
    catalog,
    write,
    renderMarkdown,
  } = ctx;
  const sources = [...new Set(profile.steps.map((s) => s.source))].map(
    (file) => {
      const bytes = fs.readFileSync(path.join(root, file));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const binary = /\.(pdf|pptx)$/.test(file);
      const content = binary ? null : bytes.toString('utf8');
      const download = binary
        ? sourceURL(file)
        : `examples/${sha256.slice(0, 16)}-${path
            .basename(file)
            .replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      if (!binary) write(download, bytes);
      let format = 'text';
      if (file.endsWith('.json')) {
        JSON.parse(content);
        format = 'json';
      }
      return {
        file,
        content,
        format,
        sha256,
        bytes: bytes.length,
        download: binary ? download : base + download,
        source: sourceURL(file),
      };
    }
  );
  const initial = sources[0];
  const sourceLink = (file) =>
    /\.(md|mmd)$/i.test(file)
      ? guideURL(file) || sourceURL(file)
      : sourceURL(file);
  const allFiles = [...ctx.tracked].filter((f) =>
    f.startsWith(demo.path + '/')
  );
  const requirements = allFiles.filter((f) =>
    /(?:requirements[^/]*\.txt|pyproject\.toml)$/.test(f)
  );
  const testFiles = allFiles.filter(
    (f) =>
      /(?:\/tests?\/|\.(?:test|spec)\.)/.test(f) &&
      /\.(?:py|[cm]?[jt]sx?|sol)$/.test(f)
  );
  const diagrams = allFiles.filter((f) => f.endsWith('.mmd'));
  // Put a genuine preserved diagram directly in the experience, including demos whose sources use a nested README.
  const readme = demo.readme || demo.guides.find((f) => /README\.md$/i.test(f));
  let architecture = '';
  if (diagrams.length)
    architecture = renderMarkdown(
      '````mermaid\n' +
        fs.readFileSync(path.join(root, diagrams[0]), 'utf8').trimEnd() +
        '\n````',
      diagrams[0]
    ).html;
  else if (readme) {
    const original = fs.readFileSync(path.join(root, readme), 'utf8');
    const block = original.match(/```mermaid\s*\n[\s\S]*?\n```/);
    if (block) architecture = renderMarkdown(block[0], readme).html;
  }
  const mode = setups[profile.mode];
  const setupCommand = profile.install
    ? `python3.12 -m venv .venv-${demo.id}\n. .venv-${demo.id}/bin/activate\n${profile.install}\npython -m pip check`
    : null;
  const numbered = profile.steps
    .map(
      (s, i) =>
        `<article class="lesson-step"><span class="lesson-number" aria-hidden="true">0${
          i + 1
        }</span><div><h3>${esc(s.title)}</h3><p>${esc(
          s.explanation
        )}</p><a class="source-reference" href="${sourceLink(s.source)}">${esc(
          s.source
        )} ↗</a><button class="text-button inspect-step" type="button" data-inspect-source="${sources.findIndex(
          (x) => x.file === s.source
        )}" hidden>Inspect this source <span aria-hidden="true">↓</span></button></div></article>`
    )
    .join('');
  const troubleshooting =
    profile.mode === 'local'
      ? [
          [
            'Port already in use',
            'Choose DEMO_PORT=18545 before the command. Do not connect a demo to an unrelated or valuable chain.',
          ],
          [
            'No final settlement evidence',
            'Read the first failed transaction or validation step. Compare the effective mission, committee thresholds and report scope; a partial report is not a completed run.',
          ],
        ]
      : ['python', 'trm', 'stdlib'].includes(profile.mode)
        ? [
            [
              'Import or dependency error',
              'Confirm the active virtual environment and the selected demo’s requirements. Run python -m pip check; do not install unrelated demo requirements over a working environment.',
            ],
            [
              'Unexpected result or missing file',
              'Check the selected entry point, configuration and output argument. Keep the seed and implementation fixed before comparing outcomes.',
            ],
          ]
        : [
            [
              'A command or service fails',
              'Start at the first error, confirm the working directory and pinned toolchain, then follow the linked component guide. Optional packages and provider services have separate prerequisites.',
            ],
            [
              'A report looks successful but lacks evidence',
              'Check its source revision, configuration, timestamps and underlying events. Historical fixtures and generated plans do not prove a fresh execution.',
            ],
          ];
  const dashboards = (profile.dashboards || [])
    .map(
      (deck) =>
        `<a class="button secondary" href="${base}${esc(deck.route)}">${esc(
          deck.title
        )} ↗</a>`
    )
    .join('');
  const deckSection = dashboards
    ? `<section class="experience-intro"><p class="eyebrow">OPEN THE COMPLETE COMMAND DECKS</p><h2>Explore the model in your browser.</h2><p class="section-description">${escape(profile.dashboardDescription || 'Read-only dashboards with energy, governance, stress scenarios and preserved diagrams. No wallet or installation required; all values come from recorded simulations.')}</p><div class="hero-actions">${dashboards}</div></section>`
    : '';
  return `${deckSection}<nav class="experience-nav" aria-label="On this demo page"><a href="#guided-tour">Guided tour</a><a href="#inspect">Inspect the sources</a><a href="#try-it">Try it locally</a><a href="#architecture">Architecture</a><a href="#library">Complete library</a></nav>
<section id="guided-tour" class="experience-intro"><p class="eyebrow">A CLOSER LOOK</p><h2>${esc(
    profile.question
  )}</h2><p class="section-description">${esc(
    profile.purpose
  )}</p><div class="lesson-steps">${numbered}</div></section>
<section id="inspect" class="source-lab" aria-labelledby="source-lab-title"><div class="section-heading"><div><p class="eyebrow">REAL REPOSITORY MATERIAL</p><h2 id="source-lab-title">Inspect. Understand. Reproduce.</h2></div><p>Reading the exact source at revision ${esc(
    revision.slice(0, 8)
  )}.<br>This browser inspection does not execute the demo.</p></div><div class="lab-toolbar" hidden><div><label for="lab-source">Choose a walkthrough source</label><select id="lab-source">${sources
    .map(
      (s, i) =>
        `<option value="${i}">${esc(
          s.file.split('/').slice(2).join('/') || s.file
        )}</option>`
    )
    .join(
      ''
    )}</select></div><div><label for="lab-search">Find a field or value</label><input id="lab-search" type="search" placeholder="Search this source…" autocomplete="off"></div></div><div class="lab-meta"><span id="lab-kind">${
    initial.format === 'json' ? 'JSON source' : 'Repository source'
  }</span><span id="lab-size">${initial.bytes.toLocaleString(
    'en-US'
  )} bytes</span><a id="lab-download" href="${initial.download}" ${
    initial.content === null ? '' : 'download'
  }>Download source ↓</a><a id="lab-original" href="${
    initial.source
  }">View on GitHub ↗</a></div><p id="lab-path" class="source-reference">${esc(
    initial.file
  )}</p><p id="lab-summary" class="muted" role="status">Select a walkthrough step to explore its source.</p><div id="lab-fields" class="lab-fields" tabindex="0" aria-label="Scrollable source fields" hidden></div><button id="lab-more" type="button" class="text-button" hidden>Show more fields ↓</button><details class="lab-raw" open><summary>Full source text</summary><pre tabindex="0" aria-label="Full selected source"><code id="lab-code">${esc(
    initial.content ??
      'This binary presentation is available through the source link above.'
  )}</code></pre></details><p class="lab-provenance">SHA-256 <code id="lab-hash">${
    initial.sha256
  }</code></p><noscript><p class="notice">The first source is shown in full. All walkthrough source links and the complete document library remain available without JavaScript.</p></noscript><template id="lab-data">${esc(
    JSON.stringify({ revision, sources })
  )}</template></section>
<section id="try-it" class="experience-run"><div><p class="eyebrow">FROM READING TO A REPRODUCIBLE RUN</p><h2>${
    profile.command
      ? 'Try the selected path.'
      : 'Continue to the implementation.'
  }</h2><span class="badge code">${mode[0]}</span><p>${esc(mode[1])}</p>${
    setupCommand
      ? `<details class="setup-recipe"><summary>Copy the environment setup</summary><pre tabindex="0" aria-label="Python environment setup"><code id="experience-setup">${esc(
          setupCommand
        )}</code></pre><button class="text-button" data-copy="experience-setup" type="button">Copy</button></details>`
      : ''
  }${
    requirements.length
      ? `<details><summary>Dependency files for this demo and its variants (${
          requirements.length
        })</summary><ul class="compact-source-list">${requirements
          .map(
            (f) =>
              `<li><a href="${sourceURL(f)}">${esc(
                f.slice(demo.path.length + 1)
              )}</a></li>`
          )
          .join('')}</ul></details>`
      : ''
  }<a class="text-link" href="${guideURL(
    'docs/START_HERE.md'
  )}">Complete environment setup ↗</a></div><div>${
    profile.command
      ? `<div class="terminal"><div class="terminal-bar"><span>SELECTED EXECUTION PATH</span><button class="text-button" data-copy="experience-command" type="button">Copy</button></div><pre tabindex="0" aria-label="Demo execution commands"><code id="experience-command">${esc(
          profile.command
        )}</code></pre></div>`
      : ''
  }<h3>What you should observe</h3><p>${esc(
    profile.expected
  )}</p><p class="notice">The source inspector above reads bundled repository material. Local commands run separately on your computer. Recorded examples may contain historical timestamps, placeholders and simulated metrics.</p></div></section>
<section class="experiment-card"><div><p class="eyebrow">MAKE IT YOUR OWN</p><h2>One useful experiment.</h2></div><p>${esc(
    profile.experiment
  )}</p></section>
<section id="architecture" class="experience-architecture"><p class="eyebrow">THE SYSTEM, MADE VISIBLE</p><h2>Architecture & relationships</h2>${
    architecture ||
    '<p>This supporting entry has no standalone architecture diagram. Follow its related experience below to inspect the canonical system.</p>'
  }${
    diagrams.length
      ? `<details><summary>All standalone flowcharts (${
          diagrams.length
        })</summary><ul class="compact-source-list">${diagrams
          .map(
            (f) =>
              `<li><a href="${guideURL(f)}">${esc(
                f.slice(demo.path.length + 1)
              )} ↗</a></li>`
          )
          .join('')}</ul></details>`
      : ''
  }</section>
<section class="experience-help"><div><p class="eyebrow">WHEN SOMETHING DOESN’T MATCH</p><h2>Troubleshooting</h2>${troubleshooting
    .map(
      ([title, body]) =>
        `<details><summary>${esc(title)}</summary><p>${esc(body)}</p></details>`
    )
    .join(
      ''
    )}</div><div><p class="eyebrow">TRACE THE CHECKS</p><h2>Verification & next steps</h2><p>${
    testFiles.length
      ? `${testFiles.length} tracked test source files are available in this directory. Inspect the tests and their environment before choosing a suite; file counts do not establish test results.`
      : 'This directory has no standalone test source files. Follow the shared implementation and its behavioral tests before making correctness claims.'
  }</p>${
    testFiles.length
      ? `<details><summary>Browse the test sources</summary><ul class="compact-source-list">${testFiles
          .map(
            (f) =>
              `<li><a href="${sourceURL(f)}">${esc(
                f.slice(demo.path.length + 1)
              )}</a></li>`
          )
          .join('')}</ul></details>`
      : ''
  }<p>For live commissioning, consult the <a href="${guideURL(
    'docs/production/readiness-2026-10-03.md'
  )}">production readiness record</a>.</p>${
    profile.related.length
      ? `<div class="related-experiences">${profile.related
          .map((name) => {
            const d = catalog.find((x) => x.name === name);
            return `<a class="button secondary" href="${base}demos/${
              d.id
            }/">${esc(d.title)} ↗</a>`;
          })
          .join('')}</div>`
      : ''
  }</div></section>`;
}
