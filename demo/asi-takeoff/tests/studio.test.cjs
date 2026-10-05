'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { createStudio } = require('../scripts/studio.cjs');
async function setup(t, root) {
  const server = createStudio(root);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      })
  );
  const port = server.address().port;
  const request = (url, method = 'GET', headers = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: url,
          method,
          headers,
          setHost: !Object.hasOwn(headers, 'Host'),
        },
        (res) => {
          let body = '';
          res.on('data', (b) => {
            body += b;
          });
          res.on('end', () =>
            resolve({ status: res.statusCode, headers: res.headers, body })
          );
        }
      );
      req.on('error', reject);
      req.end();
    });
  request.port = port;
  return request;
}
test('studio serves exact plans, assets and bounded handoff downloads', async (t) => {
  const get = await setup(t);
  for (const url of [
    '/',
    '/app.js',
    '/styles.css',
    '/architecture.svg',
    '/project-plan.planetary.json',
    '/computer-work/task.json',
    '/computer-work/analysis.example.json',
    '/computer-work/dossier.example.md',
  ]) {
    const r = await get(url);
    assert.equal(r.status, 200, url);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.match(
      r.headers['content-security-policy'],
      /frame-ancestors 'none'/
    );
    if (url.startsWith('/computer-work'))
      assert.match(r.headers['content-disposition'], /attachment/);
  }
  const result = await get('/api/plan?scenario=planetary');
  assert.equal(JSON.parse(result.body).criticalPathDays, 41);
  assert.equal((await get('/', 'HEAD')).body, '');
});
test('invalid origins, hosts, mutations, encoded paths and traversal fail closed', async (t) => {
  const get = await setup(t);
  for (const headers of [
    { Host: 'attacker.example' },
    { Host: `127.0.0.1.attacker.example:${get.port}` },
    { Host: '' },
    { Origin: 'null' },
    { Origin: 'https://attacker.example' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ])
    assert.equal((await get('/', 'GET', headers)).status, 403);
  assert.equal((await get('/', 'POST')).status, 405);
  for (const url of [
    '/../package.json',
    '/%2e%2e/package.json',
    '/%252e%252e/package.json',
    '/%5cfile',
  ])
    assert.equal((await get(url)).status, 403, url);
  for (const url of [
    '/computer-work/worker-profiles.example.json',
    '/computer-work/review.cjs',
    '/missing',
    '/constructor',
  ])
    assert.equal((await get(url)).status, 404);
  for (const url of [
    '/api/plan?scenario=constructor',
    '/api/plan?scenario=national&scenario=planetary',
    '/api/plan?other=x',
  ])
    assert.equal((await get(url)).status, 400);
});
test('symlink escape and oversized asset are rejected', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'takeoff-studio-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'ui'));
  fs.symlinkSync('/etc/hosts', path.join(dir, 'ui/index.html'));
  const get = await setup(t, dir);
  assert.equal((await get('/')).status, 403);
  fs.writeFileSync(path.join(dir, 'ui/app.js'), ' '.repeat(1024 * 1024 + 1));
  assert.equal((await get('/app.js')).status, 404);
});
