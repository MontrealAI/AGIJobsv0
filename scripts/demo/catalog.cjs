#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const start = '<!-- demo-catalog:start -->';
const end = '<!-- demo-catalog:end -->';
const quoteLink = (value) => value.split('/').map(encodeURIComponent).join('/');
function inventory(base = root) {
  const files = execFileSync('git', ['ls-files', '-z', '--', 'demo'], {
    cwd: base,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  const groups = new Map();
  for (const file of files) {
    const parts = file.split('/');
    if (parts.length < 3) continue;
    const entry = groups.get(parts[1]) || [];
    entry.push(file);
    groups.set(parts[1], entry);
  }
  const scripts = JSON.parse(
    fs.readFileSync(path.join(base, 'package.json'), 'utf8')
  ).scripts;
  const demos = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([name, entries]) => {
      const readme = entries.includes('demo/' + name + '/README.md')
        ? 'demo/' + name + '/README.md'
        : null;
      const guides = entries
        .filter((file) =>
          /(?:README|RUNBOOK|PLAYBOOK).*\.md$/i.test(path.basename(file))
        )
        .sort();
      const documentationOnly = entries.every((file) => /\.md$/i.test(file));
      const commands = Object.entries(scripts)
        .filter(
          ([key, command]) =>
            key.startsWith('demo:') &&
            command.replace(/['"]/g, '').includes('demo/' + name + '/')
        )
        .map(([key]) => key);
      return {
        name,
        path: 'demo/' + name,
        readme,
        guides,
        kind: documentationOnly
          ? 'Design guide'
          : readme
          ? 'Code and guide'
          : 'Supporting code / assets',
        commands,
      };
    });
  return {
    schemaVersion: 1,
    demos,
    commands: Object.fromEntries(
      Object.entries(scripts).filter(([key]) => key.startsWith('demo:'))
    ),
  };
}
function render(data) {
  const rows = data.demos.map((demo) => {
    const target = (demo.readme || demo.path).slice('demo/'.length);
    const commands = demo.commands.filter(
      (command) =>
        !/:(?:ci|test|lint|install|build|deploy|seed|mainnet|sepolia|apply)(?:$|:)/.test(
          command
        )
    );
    return (
      '| [' +
      demo.name.replace(/\|/g, '\\|') +
      '](' +
      quoteLink(target) +
      ') | ' +
      demo.kind +
      ' | ' +
      (commands
        .slice(0, 3)
        .map((command) => '`' + command + '`')
        .join(', ') || 'Open the guide or source directory') +
      ' |'
    );
  });
  const guides = data.demos
    .flatMap((demo) => demo.guides)
    .filter((file) => file.split('/').length > 3)
    .sort();
  return (
    start +
    '\n\n' +
    data.demos.length +
    ' tracked demo directories; labels describe repository contents, not production readiness. Commands are discovery links: read each guide before execution, especially owner, network, and provider commands. Search all registered commands with `npm run demos -- --search <text>`.\n\n| Demo or supporting directory | Contents | Registered commands (selection) |\n| --- | --- | --- |\n' +
    rows.join('\n') +
    '\n\n### Nested guides and variants\n\n' +
    guides
      .map(
        (file) =>
          '- [' +
          file.slice(5).replace(/\|/g, '\\|') +
          '](' +
          quoteLink(file.slice(5)) +
          ')'
      )
      .join('\n') +
    '\n\n' +
    end
  );
}
function updateDocument(content, generated) {
  const begin = content.indexOf(start),
    finish = content.indexOf(end);
  if (
    begin < 0 ||
    finish < begin ||
    content.indexOf(start, begin + 1) >= 0 ||
    content.indexOf(end, finish + 1) >= 0
  )
    throw new Error('Demo guide must contain exactly one catalog marker pair.');
  return (
    content.slice(0, begin) + generated + content.slice(finish + end.length)
  );
}
function main(args = process.argv.slice(2)) {
  if (args[0] === '--help') {
    console.log(
      'Usage: npm run demos -- [--search <text> | --json | --check | --write]\nLists every tracked demo directory and registered demo command. It does not launch demos or install dependencies.'
    );
    return;
  }
  if (
    args.length &&
    !(
      args.length === 1 && ['--json', '--check', '--write'].includes(args[0])
    ) &&
    !(args.length === 2 && args[0] === '--search' && args[1].trim())
  )
    throw new Error('Unknown or incomplete arguments; use --help.');
  const data = inventory();
  if (['--check', '--write'].includes(args[0])) {
    const file = path.join(root, 'demo/README.md');
    const original = fs.readFileSync(file, 'utf8');
    const updated = updateDocument(original, render(data));
    if (args[0] === '--write') fs.writeFileSync(file, updated);
    else if (updated !== original)
      throw new Error(
        'Demo catalog is stale. Run npm run demos -- --write and commit the updated guide.'
      );
    console.log(
      'Demo catalog: ' +
        data.demos.length +
        ' directories and ' +
        Object.keys(data.commands).length +
        ' registered commands checked.'
    );
    return;
  }
  if (args[0] === '--json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const query = args[0] === '--search' ? args[1].toLowerCase() : '';
  const matches = data.demos.filter((demo) =>
    JSON.stringify(demo).toLowerCase().includes(query)
  );
  const commands = Object.entries(data.commands).filter(([key, command]) =>
    (key + ' ' + command).toLowerCase().includes(query)
  );
  if (!matches.length && !commands.length)
    throw new Error('No matching demo or command. Try a shorter search term.');
  for (const demo of matches)
    console.log(
      demo.name + '\n  ' + demo.kind + ' · ' + (demo.readme || demo.path)
    );
  if (query)
    for (const [key, command] of commands)
      console.log('\nnpm run ' + key + '\n  ' + command);
  console.log(
    '\nOpen demo/README.md for setup, recommended starting points, outputs, and limitations.'
  );
}
module.exports = { inventory, render, updateDocument };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
