#!/usr/bin/env node
import http from 'node:http';

const url = new URL(process.env.HEALTHCHECK_URL ?? 'http://127.0.0.1:4100/healthz');

const request = http.get(url, (res) => {
  if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
    res.resume();
  } else {
    console.error(`Unexpected status code from indexer: ${res.statusCode}`);
    process.exit(1);
  }
});

request.on('error', (err) => {
  console.error('Failed to contact indexer health endpoint:', err.message);
  process.exit(1);
});
