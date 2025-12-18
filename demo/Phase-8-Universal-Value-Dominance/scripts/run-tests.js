const { spawnSync } = require('node:child_process');

function runStep(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Forward npm-provided args to the Jest suite (demo runner passes --runInBand)
const forwardedArgs = process.argv.slice(2);

runStep('npm', ['run', 'test:unit', '--', ...forwardedArgs]);
runStep('npm', ['run', 'test:e2e']);
