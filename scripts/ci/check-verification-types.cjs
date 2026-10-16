#!/usr/bin/env node
'use strict';
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const config = ts.readConfigFile(
  path.join(root, 'tsconfig.json'),
  ts.sys.readFile
);
if (config.error)
  throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
// Hardhat is a module with real declarations, not an @types package. Include the
// actual ethers plugin augmentation explicitly; do not stub or suppress errors.
const options = { ...parsed.options, noEmit: true, types: ['node'] };
const roots = [
  'scripts/v2/deployDefaults.ts',
  'scripts/v2/systemPauseAction.ts',
  'node_modules/@nomicfoundation/hardhat-ethers/internal/index.d.ts',
].map((file) => path.join(root, file));
const program = ts.createProgram(roots, options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (x) => x,
      getNewLine: () => '\n',
    })
  );
  process.exitCode = 1;
} else
  console.log(
    'Verification entrypoints and imported dependencies: 0 semantic TypeScript diagnostics.'
  );
