/** Strict shared parsing keeps typos and truncated paths out of operator workflows. */
export interface Phase6CliOptions {
  configPath: string;
  outputPath?: string;
  eventPath?: string;
  jsonOutput?: string;
}
export function parsePhase6Args(
  argv: string[],
  defaultConfig: string,
  flags: Array<'json' | 'output' | 'events'>,
  help: () => void
): Phase6CliOptions {
  const options: Phase6CliOptions = { configPath: defaultConfig };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      help();
      process.exit(0);
    }
    const equals = argument.indexOf('=');
    const name = equals === -1 ? argument : argument.slice(0, equals);
    if (name !== '--config' && !flags.some((flag) => name === `--${flag}`)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (seen.has(name)) throw new Error(`Duplicate option: ${name}`);
    seen.add(name);
    let value = equals === -1 ? undefined : argument.slice(equals + 1);
    if (value === undefined) {
      const next = argv[index + 1];
      if (next !== undefined && (next === '-' || !next.startsWith('-'))) {
        value = next;
        index += 1;
      } else if (name === '--json') value = '-';
    }
    if (!value || !value.trim())
      throw new Error(`${name} requires a non-empty path.`);
    if (name === '--config') options.configPath = value;
    if (name === '--output') options.outputPath = value;
    if (name === '--events') options.eventPath = value;
    if (name === '--json') options.jsonOutput = value;
  }
  return options;
}
