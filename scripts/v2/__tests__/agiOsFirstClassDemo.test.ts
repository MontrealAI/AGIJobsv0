import {
  buildUsage,
  buildPlan,
  parseArgs,
  shouldAutoAccept,
} from '../agiOsFirstClassDemo';

describe('parseArgs', () => {
  it('recognises help flags before prompting', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('defaults to an effect-free plan and supports exact dry-run alias', () => {
    expect(parseArgs([]).mode).toBe('plan');
    expect(parseArgs(['--dry-run']).mode).toBe('plan');
    expect(buildPlan(parseArgs([]))).toContain('no commands executed');
  });

  it('rejects misleading flags and unapproved execution', () => {
    for (const args of [
      ['--dry-run=false'],
      ['--auto-yes'],
      ['--help', '--yes'],
      ['--mode', 'execute', '--network', 'localhost', '--no-compose'],
    ])
      expect(() => parseArgs(args)).toThrow();
    expect(shouldAutoAccept({ 'non-interactive': true })).toBe(false);
  });

  it('collects keyed values and boolean switches', () => {
    const args = parseArgs(['--network', 'sepolia', '--yes', '--compose']);
    expect(args.network).toBe('sepolia');
    expect(args.yes).toBe(true);
    expect(args.compose).toBe(true);
  });
});

describe('buildUsage', () => {
  it('highlights the core command options', () => {
    const usage = buildUsage();
    expect(usage).toContain('--network');
    expect(usage).toContain('--help');
  });
});
