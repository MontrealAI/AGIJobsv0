const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

// Extract only the actual rendering function/expression. Never execute a CLI,
// load its configuration, contact a provider, or substitute a test implementation.
function loadRenderer(file, functionName) {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/v2', file),
    'utf8'
  );
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const matches = [];
  function visit(node) {
    if (
      functionName &&
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName
    ) {
      matches.push(`(${node.getText(ast)})`);
    } else if (
      !functionName &&
      ts.isArrowFunction(node) &&
      node.parameters[0]?.name.getText(ast) === 'line' &&
      node.body.getText(ast).includes('.replace(')
    ) {
      matches.push(`(${node.getText(ast)})`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(matches.length, 1, `unique production renderer in ${file}`);
  const javascript = ts.transpileModule(`const renderer = ${matches[0]};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(`${javascript}\nrenderer;`);
}

for (const [file, name] of [
  ['ownerCommandCenter.ts', 'escapeMarkdownTable'],
  ['ownerControlAtlas.ts', null],
  ['ownerControlSurface.ts', 'escapeMarkdown'],
]) {
  test(`${file}: preserves ordinary text and escapes existing backslashes before pipes`, () => {
    const render = loadRenderer(file, name);
    assert.equal(render('owner / amount 1000 bps'), 'owner / amount 1000 bps');
    assert.equal(render('a|b'), 'a\\|b');
    assert.equal(render('C:\\reports'), 'C:\\\\reports');
    for (let count = 0; count <= 8; count++) {
      const input = `left${'\\'.repeat(count)}|right`;
      const output = render(input);
      assert.equal(output, `left${'\\'.repeat(count * 2 + 1)}|right`);
      // An odd backslash run escapes the pipe instead of opening a table cell.
      assert.equal(output.match(/(\\+)\|/)[1].length % 2, 1);
    }
    assert.equal(render('a\\|b|c\\'), 'a\\\\\\|b\\|c\\\\');
  });
}

test('command-center keeps its existing newline rendering', () => {
  assert.equal(
    loadRenderer('ownerCommandCenter.ts', 'escapeMarkdownTable')('a\nb'),
    'a<br />b'
  );
});
