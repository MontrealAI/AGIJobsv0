#!/usr/bin/env ts-node
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

interface CliOptions {
  out?: string;
  force: boolean;
  stdout: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    force: false,
    stdout: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--out': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--out requires a value');
        }
        options.out = value;
        i += 1;
        break;
      }
      case '--force':
        options.force = true;
        break;
      case '--stdout':
        options.stdout = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag ${arg}`);
        }
    }
  }

  return options;
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate, fsConstants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function stripJsonComments(value: string): string {
  let output = '';
  let inString = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let stringQuote: string | undefined;
  let isEscaped = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const next = value[i + 1];

    if (inSingleLineComment) {
      if (char === '\n' || char === '\r') {
        inSingleLineComment = false;
        output += char;
        if (char === '\r' && next === '\n') {
          // Preserve Windows line endings
          i += 1;
          output += value[i];
        }
      }
      continue;
    }

    if (inMultiLineComment) {
      if (char === '*' && next === '/') {
        inMultiLineComment = false;
        i += 1;
        continue;
      }
      if (char === '\n' || char === '\r') {
        output += char;
        if (char === '\r' && next === '\n') {
          i += 1;
          output += value[i];
        }
      }
      continue;
    }

    if (inString) {
      output += char;
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === '\\') {
        isEscaped = true;
        continue;
      }
      if (char === stringQuote) {
        inString = false;
        stringQuote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      stringQuote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inSingleLineComment = true;
      i += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inMultiLineComment = true;
      i += 1;
      continue;
    }

    output += char;
  }

  return output;
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

function formatUsage(): string {
  return `Usage: npm run owner:template [-- --out <file> --force --stdout]\n\n` +
    `Creates a production-ready config/owner-control.json from the annotated JSONC template.\n\n` +
    `Options:\n` +
    `  --out <file>   Write the sanitised JSON to <file> (default: config/owner-control.json).\n` +
    `  --stdout       Print the sanitised JSON to stdout instead of writing a file.\n` +
    `  --force        Overwrite the output file if it already exists.\n` +
    `  --help         Show this message.`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(formatUsage());
    return;
  }

  const samplePath = path.resolve(process.cwd(), 'config', 'owner-control.sample.jsonc');
  const targetPath = options.out
    ? path.resolve(process.cwd(), options.out)
    : path.resolve(process.cwd(), 'config', 'owner-control.json');

  const raw = await fs.readFile(samplePath, 'utf8');
  const cleaned = stripJsonComments(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Failed to parse owner-control sample: ${(error as Error).message}`);
  }

  const serialised = `${JSON.stringify(parsed, null, 2)}\n`;

  if (options.stdout) {
    process.stdout.write(serialised);
    return;
  }

  if (!options.force && (await pathExists(targetPath))) {
    throw new Error(
      `${path.relative(process.cwd(), targetPath)} already exists. Pass --force to overwrite.`
    );
  }

  await ensureParentDirectory(targetPath);
  await fs.writeFile(targetPath, serialised, 'utf8');

  console.log(
    `Wrote ${path.relative(process.cwd(), targetPath)} using config/owner-control.sample.jsonc. ` +
      'Review the placeholders, commit the changes, and run `npm run owner:verify-control` before executing updates.'
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
