'use strict';
const fs = require('node:fs');
const path = require('node:path');
const scopes = new Set([
  'zenith-sapience',
  'zenith-celestial-archon',
  'zenith-omnidominion',
  'zenith-planetary-os',
]);
function prepare(
  scope,
  root = path.resolve(__dirname, '../../..'),
  mode = 'local'
) {
  // Never accept a caller-supplied path or network. These are the complete
  // supported targets; the local wrappers keep their original default mode.
  if (
    !['local', 'kit'].includes(mode) ||
    (!scopes.has(scope) &&
      !(
        mode === 'local' &&
        ['infinity-symphony', 'omnigenesis-global-symphony'].includes(scope)
      ))
  )
    throw new Error('Unknown report scope or mode');
  root = path.resolve(root);
  const relative =
    mode === 'kit' ? ['reports', scope] : ['reports', 'localhost', scope];
  let cursor = root;
  for (const component of relative) {
    cursor = path.join(cursor, component);
    try {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error(
          'Report paths must contain real directories: ' + cursor
        );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const target = cursor;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const archive = fs.mkdtempSync(target + '-previous-');
    fs.renameSync(target, path.join(archive, 'reports'));
    console.log('Previous evidence preserved: ' + path.relative(root, archive));
  }
  fs.mkdirSync(target);
  return target;
}
module.exports = { prepare, scopes };
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1) prepare(args[0]);
    else if (args.length === 2 && args[0] === '--kit')
      prepare(args[1], undefined, 'kit');
    else throw new Error('Supply one local scope, or --kit and one kit scope');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
