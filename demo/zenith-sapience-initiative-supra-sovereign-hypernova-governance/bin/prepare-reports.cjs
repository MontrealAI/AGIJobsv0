const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
function prepare(mode) {
  if (!['kit', 'local'].includes(mode))
    throw new Error('Expected kit or local.');
  const relative =
    mode === 'kit'
      ? 'reports/zenith-hypernova'
      : 'reports/localhost/zenith-hypernova';
  const target = path.join(root, relative);
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    try {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error(
          'Reports path must contain real directories: ' + cursor
        );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const archive = fs.mkdtempSync(target + '-previous-');
    fs.renameSync(target, path.join(archive, 'reports'));
    console.log('Previous evidence preserved: ' + path.relative(root, archive));
  }
  fs.mkdirSync(target);
  return target;
}
module.exports = { prepare };
if (require.main === module) prepare(process.argv[2]);
