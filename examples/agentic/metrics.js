'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'runtime-agentic.jsonl');

function append(record) {
  try {
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(record)}\n`, {
      encoding: 'utf8',
    });
  } catch (err) {
    console.warn('[metrics] append failed:', err.message || err);
  }
}

function logEnergy(phase, meta = {}) {
  append({ t: Date.now(), phase, meta, kind: 'energy' });
}

function logQuarantine(phase, reason, meta = {}) {
  append({ t: Date.now(), phase, reason, meta, kind: 'quarantine' });
}

function logTelemetry(event, meta = {}) {
  append({ t: Date.now(), event, meta, kind: 'telemetry' });
}

module.exports = {
  logEnergy,
  logQuarantine,
  logTelemetry,
  LOG_PATH,
};
