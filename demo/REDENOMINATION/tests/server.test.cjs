'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { createControlRoom } = require('../scripts/control-room.cjs');
const { DEMO } = require('../scripts/playbook.cjs');
async function server(t, root = DEMO) {
  const instance = createControlRoom(root);
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        instance.closeAllConnections();
        instance.close(resolve);
      })
  );
  return (url, method = 'GET') =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: instance.address().port,
          path: url,
          method,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () =>
            resolve({ status: res.statusCode, headers: res.headers, body })
          );
        }
      );
      req.on('error', reject);
      req.end();
    });
}
test('both dashboards, configuration and export have correct routes and MIME types', async (t) => {
  const request = await server(t);
  for (const [url, mime] of [
    ['/', 'text/html'],
    ['/ui/', 'text/html'],
    ['/ui/app.js', 'application/javascript'],
    ['/scenario.json', 'application/json'],
    ['/config/job-registry-redenominated.json', 'application/json'],
    ['/i18n/strings.json', 'application/json'],
    ['/ui/export/latest.json', 'application/json'],
  ]) {
    const response = await request(url);
    assert.equal(response.status, 200, url);
    assert.ok(response.headers['content-type'].startsWith(mime));
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.match(
      response.headers['content-security-policy'],
      /frame-ancestors 'none'/
    );
  }
});
test('HEAD works and mutation methods are rejected', async (t) => {
  const request = await server(t);
  const head = await request('/ui/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
  for (const method of ['POST', 'PUT', 'DELETE'])
    assert.equal((await request('/', method)).status, 405);
});
test('missing and disallowed files return real errors rather than fallback HTML', async (t) => {
  const request = await server(t);
  for (const url of [
    '/missing',
    '/ui/missing.json',
    '/scripts/playbook.cjs',
    '/README.md',
  ])
    assert.equal((await request(url)).status, 404);
  assert.equal((await request('/%E0%A4%A')).status, 400);
});
test('raw, encoded, double-encoded and backslash traversal are rejected', async (t) => {
  const request = await server(t);
  for (const url of [
    '/../package.json',
    '/ui/../../config/agialpha.json',
    '/ui/%2e%2e/%2e%2e/package.json',
    '/ui/%252e%252e/file.json',
    '/ui/%5c..%5cfile.json',
    '/ui/%00.json',
  ])
    assert.equal((await request(url)).status, 403, url);
});
test('symlink escape and oversized files are denied', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redenom-server-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  fs.mkdirSync(path.join(root, 'ui'));
  fs.symlinkSync(
    path.join(DEMO, '../../package.json'),
    path.join(root, 'ui/escape.json')
  );
  fs.writeFileSync(
    path.join(root, 'ui/huge.json'),
    ' '.repeat(4 * 1024 * 1024 + 1)
  );
  const request = await server(t, root);
  assert.equal((await request('/ui/escape.json')).status, 403);
  assert.equal((await request('/ui/huge.json')).status, 404);
});
test('invalid port or failed generation prevents server startup', () => {
  for (const [port, args] of [
    ['NaN', []],
    ['65536', []],
    ['0', ['--ratio', '0']],
  ]) {
    const result = spawnSync(
      process.execPath,
      [path.join(DEMO, 'scripts/control-room.cjs'), ...args],
      { env: { ...process.env, PORT: port }, encoding: 'utf8', timeout: 5000 }
    );
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout, /http:\/\/127/);
  }
});
