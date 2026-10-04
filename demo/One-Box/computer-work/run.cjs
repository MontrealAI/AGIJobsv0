#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomUUID, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const { computerTaskDigest, parseComputerWorkTask } = require(path.join(
  root,
  'apps/orchestrator/dist/apps/orchestrator/computerWork.js'
));
const { buildPipeline } = require(path.join(
  root,
  'apps/orchestrator/dist/apps/orchestrator/pipeline.js'
));
const { review } = require('./review.cjs');
const load = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
  });

async function main() {
  const [mode, file, jobId] = process.argv.slice(2);
  if (mode === 'inspect') {
    if (!file || jobId) throw new Error('Usage: run.cjs inspect TASK.json');
    const task = parseComputerWorkTask(load(file));
    console.log(
      JSON.stringify(
        { task, taskSha256: computerTaskDigest(task), admitted: false },
        null,
        2
      )
    );
    return;
  }
  if (mode === 'run') {
    if (!file || !jobId || process.argv.length !== 5)
      throw new Error('Usage: run.cjs run TASK.json JOB_ID');
    const task = parseComputerWorkTask(load(file));
    const [stage] = buildPipeline({
      jobId,
      category: 'computer-work',
      tags: [],
      metadata: { computerWork: task },
    });
    const receipt = await stage.agent({});
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }
  if (mode && mode !== '--inject-error')
    throw new Error(
      'Usage: run.cjs [--inject-error] | inspect TASK.json | run TASK.json JOB_ID'
    );
  const { chromium } = require('playwright');
  const AxeBuilder = require('@axe-core/playwright').default;
  const out = path.join(root, 'reports/computer-work', randomUUID());
  fs.mkdirSync(out, { recursive: true });
  const token = randomUUID();
  const actions = [];
  let origin;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  let calls = 0;
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(
        fs
          .readFileSync(path.join(__dirname, 'fixture.html'), 'utf8')
          .replace('__QUOTES__', JSON.stringify(require('./quotes.json')))
      );
      return;
    }
    if (
      req.method !== 'POST' ||
      req.url !== '/v1/responses' ||
      req.headers.authorization !== `Bearer ${token}`
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    calls++;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 64_000) throw new Error('Request too large');
      }
      const request = JSON.parse(body);
      if (
        request.model !== 'openclaw/procurement' ||
        !req.headers['x-openclaw-session-key']
      )
        throw new Error('Invalid adapter request');
      await page.goto(origin);
      actions.push('Opened isolated fixture');
      await page.getByLabel('Maximum delivery time').selectOption('7');
      actions.push('Selected 7-day delivery limit');
      await page.getByRole('button', { name: 'Compare quotes' }).click();
      actions.push('Compared quotes using the visible control');
      const quotes = await page
        .locator('tbody tr')
        .evaluateAll((rows) =>
          rows.map((row) => ({
            supplier: row.cells[0].textContent,
            totalCents: Number(row.cells[4].dataset.cents),
            eligible: row.cells[5].textContent === 'Yes',
          }))
        );
      const eligible = quotes
        .filter((x) => x.eligible)
        .sort((a, b) => a.totalCents - b.totalCents);
      const report = {
        maxDeliveryDays: 7,
        quotes,
        recommendedSupplier:
          mode === '--inject-error' ? 'Laurentian' : eligible[0].supplier,
        purchaseExecuted: false,
      };
      await page.screenshot({
        path: path.join(out, 'desktop.png'),
        fullPage: true,
      });
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      write(path.join(out, 'accessibility.json'), axe);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: path.join(out, 'mobile.png'),
        fullPage: true,
      });
      if (axe.violations.length || pageErrors.length)
        throw new Error('Browser checks failed');
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          id: 'fixture_' + randomUUID(),
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    status: 'completed',
                    summary:
                      'Synthetic supplier comparison from actual browser interaction.',
                    artifacts: [
                      {
                        name: 'comparison.json',
                        mediaType: 'application/json',
                        content: JSON.stringify(report, null, 2),
                      },
                      {
                        name: 'recommendation.md',
                        mediaType: 'text/markdown',
                        content:
                          '# Supplier recommendation\n\n' +
                          report.recommendedSupplier +
                          ' is recommended for review. No purchase executed.\n',
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        })
      );
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort()
    );
    const task = {
      ...load(path.join(__dirname, 'task.json')),
      allowedOrigins: [origin],
    };
    const profiles = {
      procurement: {
        endpoint: origin + '/v1/responses',
        agentId: 'procurement',
        tokenEnv: 'COMPUTER_WORK_FIXTURE_TOKEN',
        deploymentId: 'synthetic-' + path.basename(out),
        mode: 'fixture',
        timeoutMs: 30_000,
        maxResponseBytes: 262144,
        maxOutputTokens: 4096,
        approvedJobs: [{ jobId: '1', taskSha256: computerTaskDigest(task) }],
      },
    };
    const config = path.join(out, 'profiles.json');
    write(config, profiles);
    process.env.COMPUTER_WORK_FIXTURE_TOKEN = token;
    process.env.COMPUTER_WORK_PROFILES_FILE = config;
    process.env.COMPUTER_WORK_STATE_DIR = path.join(out, 'journal');
    const [stage] = buildPipeline({
      jobId: '1',
      category: 'computer-work',
      tags: ['synthetic'],
      metadata: { computerWork: task },
    });
    const receipt = await stage.agent({});
    const verdict = review(receipt);
    write(path.join(out, 'receipt.json'), receipt);
    write(path.join(out, 'review.json'), verdict);
    for (const artifact of receipt.artifacts)
      fs.writeFileSync(path.join(out, artifact.name), artifact.content);
    write(path.join(out, 'browser-evidence.json'), {
      simulatedDecisions: true,
      actualBrowser: true,
      actualProvider: false,
      actualChain: false,
      calls,
      actions,
      pageErrors,
      screenshotSha256: createHash('sha256')
        .update(fs.readFileSync(path.join(out, 'desktop.png')))
        .digest('hex'),
    });
    if (calls !== 1) throw new Error('Expected one worker dispatch');
    console.log(
      JSON.stringify(
        {
          mode: 'fixture',
          browserExecuted: true,
          liveProvider: false,
          settlementApproved: false,
          accepted: verdict.accepted,
          passedChecks: verdict.checks.filter((x) => x.passed).length,
          totalChecks: verdict.checks.length,
          evidenceDirectory: out,
        },
        null,
        2
      )
    );
    if (!verdict.accepted) process.exitCode = 1;
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await browser.close();
    delete process.env.COMPUTER_WORK_FIXTURE_TOKEN;
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
