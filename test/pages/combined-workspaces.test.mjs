import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dashboardAdditions,
  expectedDashboardRoutes,
} from './dashboard-contract.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const additions = [
  'atlas',
  'celestial',
  'empowerment',
  'governance',
  'iconic',
  'omega',
  'omniphoenix',
  'polaris',
  'zenith',
];

test('combined release retains all nine implemented workspaces and fifteen legacy routes', () => {
  assert.deepEqual(
    dashboardAdditions.map(({ route }) => route.split('/')[1]).sort(),
    additions
  );
  assert.equal(expectedDashboardRoutes(root).length, 24);
  for (const { source } of dashboardAdditions)
    assert.ok(
      fs.statSync(path.join(root, source, 'index.html')).isFile(),
      source
    );
});

test('mandatory browser QA executes each combined workspace exactly once', () => {
  const qa = fs.readFileSync(
    path.join(root, 'scripts/pages/browser-qa.mjs'),
    'utf8'
  );
  const build = fs.readFileSync(
    path.join(root, 'scripts/pages/build.mjs'),
    'utf8'
  );
  for (const name of additions) {
    const functionName = `verify${name[0].toUpperCase()}${name.slice(1)}`;
    assert.equal(
      (qa.match(new RegExp(`await ${functionName}\\(`, 'g')) || []).length,
      1,
      functionName
    );
    assert.equal(
      (
        build.match(
          new RegExp(`dashboardRoutes\\.push\\('experiments/${name}/'\\)`, 'g')
        ) || []
      ).length,
      1,
      name
    );
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.match(pkg.scripts['site:test'], /test\/pages\/\*\.test\.mjs/);
  assert.match(pkg.scripts['site:qa'], /scripts\/pages\/browser-qa\.mjs/);
});
