#!/usr/bin/env node
/**
 * Observability smoke check
 * Validates that monitoring configuration files ship with the
 * expected scrape jobs, alert routes, and Grafana dashboards so
 * non-technical operators can trust the out-of-the-box deployment.
 */
const fs = require('fs');
const path = require('path');

function readFile(relativePath) {
  const filePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function checkIncludes(text, expected, context) {
  const missing = expected.filter((needle) => !text.includes(needle));
  if (missing.length > 0) {
    throw new Error(
      `${context} is missing expected entries: ${missing.join(', ')}`
    );
  }
  return `${context} contains ${expected.length} expected entries`;
}

const checks = [
  {
    name: 'Prometheus scrape targets',
    run() {
      const text = readFile('monitoring/prometheus/prometheus.yml');
      return checkIncludes(
        text,
        [
          'job_name: orchestrator',
          'job_name: bundler',
          'job_name: paymaster-supervisor',
          'job_name: attester',
          'job_name: ipfs',
          'job_name: graph-node',
        ],
        'prometheus.yml'
      );
    },
  },
  {
    name: 'Prometheus alert + recording rules',
    run() {
      const text = readFile('monitoring/prometheus/rules.yaml');
      return checkIncludes(
        text,
        [
          'record: service:tto_seconds:rate5m',
          'alert: LowGasBalance',
          'alert: SponsorshipRejectionSpike',
          'alert: BundlerRevertSpike',
        ],
        'rules.yaml'
      );
    },
  },
  {
    name: 'Alertmanager receivers',
    run() {
      const text = readFile('monitoring/alertmanager/alerts.yaml');
      return checkIncludes(
        text,
        ['receiver: pagerduty', 'receiver: slack'],
        'alerts.yaml'
      );
    },
  },
  {
    name: 'Grafana dashboard schema',
    run() {
      const raw = readFile('monitoring/grafana/dashboard-agi-ops.json');
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        throw new Error(`dashboard-agi-ops.json is not valid JSON: ${err.message}`);
      }
      if (!parsed.title || typeof parsed.title !== 'string') {
        throw new Error('Grafana dashboard missing title');
      }
      if (!Array.isArray(parsed.panels) || parsed.panels.length === 0) {
        throw new Error('Grafana dashboard missing panels');
      }
      return `dashboard "${parsed.title}" exposes ${parsed.panels.length} panels`;
    },
  },
];

const results = [];
let failures = 0;
for (const check of checks) {
  try {
    const detail = check.run();
    results.push({ name: check.name, status: 'PASS', detail });
  } catch (err) {
    failures += 1;
    results.push({ name: check.name, status: 'FAIL', detail: err.message });
  }
}

const longestName = Math.max(...results.map((r) => r.name.length));
console.log('Observability smoke check summary\n');
for (const result of results) {
  const name = result.name.padEnd(longestName);
  console.log(`${result.status.padEnd(5)} | ${name} | ${result.detail}`);
}

if (failures > 0) {
  console.error(`\n${failures} observability checks failed.`);
  process.exit(1);
}

console.log('\nAll observability checks passed.');
