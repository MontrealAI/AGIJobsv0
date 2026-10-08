import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { marked } from 'marked';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const reports = path.join(root, 'reports/pages');
const sources = [];
const templateTargets = [];
const files = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\0')
  .filter((file) => /\.(?:md|mmd|html)$/i.test(file));

// Validate the actual repository sources, without the site's legacy adapters.
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const append = (source, index) =>
    sources.push({
      file,
      index,
      sha256: createHash('sha256').update(source).digest('hex'),
      text: source,
    });
  if (/\.mmd$/i.test(file)) append(text.trimEnd(), 0);
  else if (/\.html$/i.test(file)) {
    const document = new JSDOM(text).window.document;
    [...document.querySelectorAll('.mermaid')].forEach((element, index) => {
      const source = element.textContent.trim();
      if (/^\{\{[^{}]+\}\}$/.test(source)) {
        // Server template expressions are not diagram source. Record their
        // separate coverage boundary; rendered endpoint tests must supply them.
        templateTargets.push({ file, index, expression: source });
      } else if (source) append(source, index);
    });
  } else {
    let index = 0;
    marked.walkTokens(marked.lexer(text), (token) => {
      if (token.type === 'code' && token.lang?.trim() === 'mermaid')
        append(token.text, index++);
    });
  }
}
assert.ok(sources.length > 0, 'No tracked Mermaid sources were found');

// Serve the locked renderer from memory; no CDN or external service is needed.
const bundle = await build({
  stdin: {
    contents: 'export { default } from "mermaid";',
    resolveDir: root,
    sourcefile: 'mermaid-source-qa.mjs',
  },
  write: false,
  bundle: true,
  format: 'esm',
  minify: true,
  logLevel: 'silent',
});
const server = http.createServer((request, response) => {
  if (request.url === '/mermaid.mjs') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(bundle.outputFiles[0].contents);
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><body></body></html>');
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const failures = [];
const externalRequests = [];
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol))
      return route.continue();
    externalRequests.push(url.href);
    return route.abort();
  });
  await page.goto(origin);
  for (let offset = 0; offset < sources.length; offset += 30) {
    const results = await page.evaluate(
      async ({ items, offset }) => {
        const { default: mermaid } = await import('/mermaid.mjs');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          maxTextSize: 200000,
        });
        const failures = [];
        for (const [index, source] of items.entries()) {
          try {
            await mermaid.parse(source.text);
            const { svg } = await mermaid.render(
              `source-diagram-${offset + index}`,
              source.text
            );
            if (!svg.includes('<svg')) throw new Error('Missing rendered SVG');
            if (/(?:NaN|undefined)px|(?:width|height|[xy])="NaN"/.test(svg))
              throw new Error('Invalid rendered SVG geometry');
          } catch (error) {
            failures.push({
              file: source.file,
              index: source.index,
              error: String(error).slice(0, 1600),
            });
          } finally {
            document.body.replaceChildren();
          }
        }
        return failures;
      },
      { items: sources.slice(offset, offset + 30), offset }
    );
    failures.push(...results);
  }
  fs.mkdirSync(reports, { recursive: true });
  fs.writeFileSync(
    path.join(reports, 'mermaid-source-validation.json'),
    JSON.stringify(
      {
        status:
          failures.length || externalRequests.length ? 'failed' : 'passed',
        mermaidVersion: JSON.parse(
          fs.readFileSync(
            path.join(root, 'node_modules/mermaid/package.json'),
            'utf8'
          )
        ).version,
        total: sources.length,
        failures,
        externalRequests,
        templateTargets,
        sources: sources.map(({ text, ...source }) => source),
      },
      null,
      2
    ) + '\n'
  );
  assert.deepEqual(failures, [], 'Every original Mermaid source must render');
  assert.deepEqual(externalRequests, [], 'Unexpected Mermaid network requests');
  console.log(
    JSON.stringify({
      status: 'passed',
      diagrams: sources.length,
      templateTargets: templateTargets.length,
      failures: 0,
    })
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
