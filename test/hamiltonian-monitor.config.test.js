const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');

const { loadHamiltonianMonitorConfig } = require('../scripts/config');

test('loadHamiltonianMonitorConfig accepts signed Hamiltonian records', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hamiltonian-config-'));
  const configPath = path.join(tmpDir, 'hamiltonian-monitor.json');
  const payload = {
    window: 12,
    records: [
      {
        d: -42,
        u: '0',
        timestamp: 0,
        note: 'negative delta with zero utility',
      },
    ],
  };

  fs.writeFileSync(configPath, JSON.stringify(payload));

  const result = loadHamiltonianMonitorConfig({ path: configPath });
  const record = result.config.records[0];

  assert.equal(record.d, '-42');
  assert.equal(record.u, '0');
  assert.equal(record.timestamp, '0');
  assert.equal(record.note, 'negative delta with zero utility');
});
