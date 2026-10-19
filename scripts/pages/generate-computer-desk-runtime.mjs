import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initComputerDesk } from '../../website/assets/computer-desk.mjs';
const filename = fileURLToPath(
  new URL(
    '../../website/assets/computer-desk-runtime-source.mjs',
    import.meta.url
  )
);
const expected =
  '// Generated from initComputerDesk; checked by source parity tests.\nexport const computerDeskRuntimeSource =\n  ' +
  JSON.stringify(initComputerDesk.toString()) +
  ';\n';
if (process.argv[2] === '--write' && process.argv.length === 3)
  fs.writeFileSync(filename, expected);
else if (process.argv[2] !== '--check' || process.argv.length !== 3)
  throw Error('Use --write or --check');
if (fs.readFileSync(filename, 'utf8') !== expected)
  throw Error(
    'Regenerate the exact desk runtime after reviewing its source change'
  );
