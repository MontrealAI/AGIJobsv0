import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const {
  executeSynthesis,
  resolveRunOptions,
  parseArgs,
} = require('../scripts/runSynthesis.ts');
const { runFullPipeline } = require('../scripts/fullPipeline.ts');
const { ensureMissionValidity } = require('../scripts/validation.ts');
const mission = require('../config/mission.meta-agentic-program-synthesis.json');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('all default report paths respect the selected directory', () => {
  const options = resolveRunOptions({ reportDir: '/tmp/chosen-output' });
  for (const key of [
    'reportFile',
    'summaryFile',
    'dashboardFile',
    'manifestFile',
    'triangulationFile',
    'briefingFile',
  ])
    assert.equal(path.dirname(options[key]), '/tmp/chosen-output');
  assert.throws(() => parseArgs(['--report-dir']));
  assert.throws(() => parseArgs(['--typo']));
});
test('mission rejects fractional budgets and non-finite examples', () => {
  for (const mutate of [
    (m) => (m.parameters.generations = 1.5),
    (m) => (m.parameters.populationSize = 1e9),
    (m) => (m.tasks[0].examples[0].input[0] = NaN),
    (m) => (m.tasks[0].owner.thermodynamicTarget = Infinity),
  ]) {
    const copy = structuredClone(mission);
    mutate(copy);
    assert.throws(() => ensureMissionValidity(copy));
  }
});
test('full pipeline writes an integrity-verifiable portable output and parseable embedded JSON', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synthesis-full-'));
  try {
    await runFullPipeline({ reportDir: dir });
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(dir, 'meta-agentic-program-synthesis-manifest.json')
      )
    );
    assert.ok(manifest.entries.length >= 11);
    for (const entry of manifest.entries) {
      const bytes = fs.readFileSync(path.join(dir, entry.path));
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        entry.sha256
      );
      assert.equal(bytes.length, entry.bytes);
    }
    const html = fs.readFileSync(
      path.join(dir, 'meta-agentic-program-synthesis-dashboard.html'),
      'utf8'
    );
    const doc = new JSDOM(html).window.document;
    assert.equal(
      JSON.parse(doc.querySelector('#meta-agentic-summary').textContent)
        .evidenceClass,
      'seeded-simulation'
    );
    assert.equal(
      doc.querySelector('script[src]').getAttribute('src'),
      './mermaid.min.js'
    );
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(dir, 'meta-agentic-program-synthesis-full.json')
        )
      ).settlementApproved,
      false
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
