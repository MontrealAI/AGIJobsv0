'use strict';
// Optional maintainer tool; runtime planning has no third-party dependencies.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createControlRoom } = require('./control-room.cjs');
const { DEMO } = require('./playbook.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ||
  'playwright');
const renderer = '12.1.0';
async function main() {
  const dist =
    process.env.MERMAID_DIST_DIR || path.dirname(require.resolve('mermaid'));
  const pkg = JSON.parse(fs.readFileSync(path.join(dist, '../package.json')));
  if (pkg.version !== renderer)
    throw new Error(`Use Mermaid ${renderer} to rebuild the preserved diagram`);
  const server = createControlRoom();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage();
    await page.route('https://fonts.**/*', (route) => route.abort());
    await page.route('https://cdn.jsdelivr.net/**', (route) => {
      const prefix = `/npm/mermaid@${renderer}/dist/`;
      const url = new URL(route.request().url());
      const name = decodeURIComponent(url.pathname.slice(prefix.length));
      const file = path.resolve(dist, name),
        relative = path.relative(dist, file);
      if (
        !url.pathname.startsWith(prefix) ||
        relative.startsWith('..') ||
        path.isAbsolute(relative) ||
        !file.endsWith('.mjs')
      )
        return route.abort();
      return route.fulfill({
        body: fs.readFileSync(file),
        contentType: 'application/javascript',
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('#mermaid-diagram svg', { timeout: 30000 });
    const diagram = JSON.parse(
      fs.readFileSync(path.join(DEMO, 'scenario.json'))
    ).mermaid;
    const sourceSha256 = crypto
      .createHash('sha256')
      .update(diagram)
      .digest('hex');
    const svg = await page
      .locator('#mermaid-diagram svg')
      .evaluate((element) => {
        const bounds = element.viewBox.baseVal;
        element.setAttribute('width', String(bounds.width));
        element.setAttribute('height', String(bounds.height));
        element.style.background = '#0a1024';
        return element.outerHTML;
      });
    fs.writeFileSync(path.join(DEMO, 'ui/architecture.svg'), svg + '\n');
    fs.writeFileSync(
      path.join(DEMO, 'ui/architecture.provenance.json'),
      JSON.stringify(
        {
          renderer: `mermaid@${renderer}`,
          sourceSha256,
          svgSha256: crypto
            .createHash('sha256')
            .update(svg + '\n')
            .digest('hex'),
        },
        null,
        2
      ) + '\n'
    );
    console.log(
      `Preserved diagram rendered with Mermaid ${renderer}; source ${sourceSha256}`
    );
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
