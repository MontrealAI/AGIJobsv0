'use strict';
const fs = require('node:fs');
const path = require('node:path');

function cleanupReportRoot(root, requested) {
  if (typeof requested !== 'string' || !requested.trim())
    throw new Error(
      'REPORT_ROOT must name a directory below repository reports/'
    );
  const reports = path.resolve(root, 'reports');
  const target = path.resolve(root, requested);
  const relative = path.relative(reports, target);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error(
      'Refusing cleanup outside a named repository reports/ subdirectory'
    );
  // Reject every symlink component, including the reports directory itself.
  // No unrelated external directory may be removed through a linked ancestor.
  let current = reports;
  for (const part of ['', ...relative.split(path.sep)]) {
    if (part) current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error('Refusing cleanup through a symbolic link');
  }
  fs.rmSync(target, { recursive: true, force: true });
  return target;
}
module.exports = { cleanupReportRoot };
if (require.main === module) {
  try {
    if (process.argv.length !== 3)
      throw new Error('Usage: helios-clean.cjs REPORT_ROOT');
    cleanupReportRoot(path.resolve(__dirname, '../..'), process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
