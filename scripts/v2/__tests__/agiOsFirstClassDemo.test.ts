import { buildUsage, parseArgs } from '../agiOsFirstClassDemo';

describe('parseArgs', () => {
  it('recognises help flags before prompting', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
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
