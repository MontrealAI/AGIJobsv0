import fs from 'fs';
import path from 'path';
import hre from 'hardhat';

type DrillSummary = {
  scenario: string;
  testFile: string;
  network: string;
  passed: boolean;
  durationMs: number;
  timestamp: string;
  logPath: string;
  error?: { message: string; stack?: string };
};

function isoTimestamp(): string {
  return new Date().toISOString().replace(/[:]/g, '-');
}

async function ensureDir(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function main() {
  console.log('Starting validator misbehaves drill');
  const testFile = 'test/v2/jobLifecycleWithDispute.integration.test.ts';
  const outputDir = path.resolve('internal_docs/security/drills');
  await ensureDir(outputDir);

  const timestamp = isoTimestamp();
  const baseName = `${timestamp}-validator-misbehaves`;
  const logPath = path.join(outputDir, `${baseName}.log`);
  const summaryPath = path.join(outputDir, `${baseName}.json`);

  const logStream = fs.createWriteStream(logPath, { flags: 'w' });
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const start = Date.now();
  let passed = true;
  let capturedError: DrillSummary['error'];

  console.log('Compiling contracts (if needed)');
  await hre.run('compile');
  console.log('Running Hardhat drill via hre.run("test")');

  function tee(
    original: typeof process.stdout.write
  ): typeof process.stdout.write {
    return ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
        logStream.write(chunk);
      }
      return original(chunk, encoding, callback);
    }) as typeof process.stdout.write;
  }

  (process.stdout.write as any) = tee(originalStdoutWrite);
  (process.stderr.write as any) = tee(originalStderrWrite);

  try {
    await hre.run('test', { testFiles: [testFile], noCompile: true });
  } catch (error) {
    passed = false;
    if (error instanceof Error) {
      capturedError = { message: error.message, stack: error.stack };
    } else {
      capturedError = { message: String(error) };
    }
  } finally {
    logStream.end();
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  const durationMs = Date.now() - start;
  const summary: DrillSummary = {
    scenario: 'validator-misbehaves',
    testFile,
    network: hre.network.name,
    passed,
    durationMs,
    timestamp,
    logPath: path.relative(process.cwd(), logPath),
    error: capturedError,
  };

  await fs.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2));

  if (!passed) {
    throw new Error(
      `Validator misbehaves drill failed. See ${path.relative(
        process.cwd(),
        summaryPath
      )}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
