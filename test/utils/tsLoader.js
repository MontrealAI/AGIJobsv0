const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function compileAndRequireTsModule(tsPath) {
  const source = fs.readFileSync(tsPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: 'ES2020',
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
    fileName: tsPath,
  });

  const moduleExports = { exports: {} };

  const localRequire = (specifier) => {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const baseDir = path.dirname(tsPath);
      const joined = path.join(baseDir, specifier);
      try {
        const resolved = require.resolve(joined);
        return require(resolved);
      } catch (err) {
        const withTsExtension =
          joined.endsWith('.ts') || joined.endsWith('.tsx')
            ? joined
            : `${joined}.ts`;
        if (fs.existsSync(withTsExtension)) {
          return compileAndRequireTsModule(withTsExtension);
        }
        throw err;
      }
    }
    return require(specifier);
  };

  const evaluator = new Function(
    'require',
    'module',
    'exports',
    '__filename',
    '__dirname',
    outputText
  );

  evaluator(
    localRequire,
    moduleExports,
    moduleExports.exports,
    tsPath,
    path.dirname(tsPath)
  );

  return moduleExports.exports;
}

module.exports = { compileAndRequireTsModule };
