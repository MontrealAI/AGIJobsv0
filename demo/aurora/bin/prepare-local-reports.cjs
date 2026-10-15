'use strict';
const fs = require('node:fs');
const path = require('node:path');
const scopes = new Set([
  'zenith-sapience',
  'zenith-celestial-archon',
  'zenith-omnidominion',
  'zenith-planetary-os',
]);
function prepare(scope, root = path.resolve(__dirname, '../../..')) {
  if (!scopes.has(scope)) throw new Error('Unknown local report scope');
  root = path.resolve(root);
  const relative = ['reports', 'localhost', scope];
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
    if (process.argv.length !== 3)
      throw new Error('Supply one local report scope');
    prepare(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
