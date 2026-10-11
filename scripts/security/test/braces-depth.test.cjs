'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { verify } = require('../verify-braces-patch.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const fixed = require('braces');
const original = require('../../../vendor/braces/upstream');
const limited = (error) =>
  error instanceof SyntaxError &&
  error.code === 'BRACES_MAX_DEPTH' &&
  !/call stack/i.test(error.message);
const nest = (depth, open = '{', close = '}') =>
  open.repeat(depth) + 'a' + close.repeat(depth);

test('the installed package is the exact maintained source and every resolution is patched', () => {
  assert.equal(verify().installedBytesVerified, true);
  const fromMicromatch = createRequire(
    require.resolve('micromatch/package.json')
  );
  assert.equal(fromMicromatch.resolve('braces'), require.resolve('braces'));
  assert.deepEqual(
    require('micromatch')(
      ['src/a.js', 'src/b.ts', 'test/a.js'],
      'src/*.{js,ts}'
    ),
    ['src/a.js', 'src/b.ts']
  );
});

test('provenance validation rejects relabelled source or an unpatched lock resolution', () => {
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), 'agi-braces-integrity-')
  );
  try {
    fs.cpSync(path.join(ROOT, 'vendor'), path.join(fixture, 'vendor'), {
      recursive: true,
    });
    for (const name of ['package.json', 'package-lock.json'])
      fs.copyFileSync(path.join(ROOT, name), path.join(fixture, name));
    verify(fixture, false);
    const source = path.join(fixture, 'vendor/braces/patched/lib/depth.js');
    const manifestPath = path.join(fixture, 'vendor/braces/provenance.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    fs.appendFileSync(
      source,
      '\n// changed source without rebuilding the archive\n'
    );
    manifest.patched.files['lib/depth.js'] = createHash('sha256')
      .update(fs.readFileSync(source))
      .digest('hex');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => verify(fixture, false), /archive\/source mismatch/);
    fs.cpSync(path.join(ROOT, 'vendor'), path.join(fixture, 'vendor'), {
      recursive: true,
    });
    const lockPath = path.join(fixture, 'package-lock.json');
    const lock = JSON.parse(fs.readFileSync(lockPath));
    lock.packages['node_modules/braces'].version = '3.0.3';
    fs.writeFileSync(lockPath, JSON.stringify(lock));
    assert.throws(() => verify(fixture, false), /node_modules\/braces/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('the retained original reproduces stack exhaustion; the installed patch rejects the same input', () => {
  const program = `const b=require(process.argv[1]);try{b.compile('{'.repeat(4500)+'a'+'}'.repeat(4500));process.exit(2)}catch(e){console.log(e.name+':'+(e.code||'')+':'+e.message)}`;
  for (const [entry, expected] of [
    [path.join(ROOT, 'vendor/braces/upstream'), /RangeError:.*call stack/],
    [require.resolve('braces'), /SyntaxError:BRACES_MAX_DEPTH:/],
  ]) {
    const child = spawnSync(process.execPath, ['-e', program, entry], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 65536,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, expected);
  }
});

for (const mode of ['parse', 'compile', 'expand', 'stringify']) {
  test(`${mode} bounds braces, parentheses, mixed and unclosed structural nesting`, () => {
    for (const input of [
      nest(4500),
      nest(4500, '(', ')'),
      nest(2200, '{(', ')}'),
      '{'.repeat(4500) + 'a',
    ]) {
      for (const options of [
        {},
        { maxLength: Infinity, maxDepth: Infinity },
        { maxLength: NaN },
      ])
        assert.throws(() => fixed[mode](input, options), limited);
    }
    assert.doesNotThrow(() => fixed[mode](nest(127)));
    assert.throws(() => fixed[mode](nest(128)), limited);
  });
}

for (const mode of ['compile', 'expand', 'stringify']) {
  test(`${mode} also bounds externally supplied ASTs and child cycles`, () => {
    const leaf = { type: 'text', value: 'a', nodes: [] };
    let ast = leaf;
    for (let i = 0; i < 5000; i++) {
      const parent = { type: 'root', nodes: [ast] };
      ast.parent = parent;
      ast = parent;
    }
    assert.throws(() => fixed[mode](ast), limited);
    const cyclic = { type: 'root', nodes: [] };
    cyclic.nodes.push(cyclic);
    assert.throws(() => fixed[mode](cyclic), limited);
  });
}

test('expand refuses cyclic parent links before an unbounded loop', () => {
  const ast = { type: 'paren', nodes: [] };
  ast.parent = ast;
  assert.throws(() => fixed.expand(ast), limited);
});

test('quoted, escaped and square-bracket braces remain literal', () => {
  for (const input of [
    '"' + nest(4500) + '"',
    '[' + nest(4500) + ']',
    '\\{'.repeat(3000),
  ]) {
    for (const mode of ['compile', 'expand', 'stringify'])
      assert.deepEqual(fixed[mode](input), original[mode](input));
  }
});

test('seeded ordinary-pattern differential corpus preserves compile, expand and stringify behavior', () => {
  let seed = 0x39212026;
  const random = (n) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % n;
  };
  const pieces = [
    'src/',
    '*',
    '**/',
    '.js',
    '{a,b}',
    '{1..4}',
    '{04..01}',
    '{a..d}',
    '{a,{b,c}}',
    '{,x}',
    '\\{x,y}',
    '"{x,y}"',
    '[{}]',
    '(a)',
    '${x,y}',
    '{a..}',
    '{a,b',
    'a,b}',
    '{x,,y}',
    '{a,b}{1,2}',
  ];
  const cases = new Set([
    '',
    'a',
    '{}',
    nest(64),
    'a/{b,c}/d',
    'file-{001..010}.txt',
  ]);
  for (let i = 0; i < 4000; i++) {
    let s = '';
    for (let j = 0, n = 1 + random(4); j < n; j++)
      s += pieces[random(pieces.length)];
    cases.add(s);
  }
  assert(
    cases.size > 1500,
    'The differential corpus must contain varied distinct cases'
  );
  const outcome = (b, mode, input, options) => {
    try {
      return { value: b[mode](input, options) };
    } catch (error) {
      return { name: error.name, message: error.message };
    }
  };
  for (const input of cases)
    for (const mode of ['compile', 'expand', 'stringify'])
      for (const options of [
        {},
        { nodupes: true, noempty: true, escapeInvalid: true },
        { keepQuotes: true, keepEscaping: true },
      ]) {
        assert.deepEqual(
          outcome(fixed, mode, input, options),
          outcome(original, mode, input, options),
          `${mode}: ${input}`
        );
      }
});
