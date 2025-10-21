const BLOCKED_TERMS = [
  'violence',
  'weapon',
  'exploit',
  'fraud'
];

export interface SafetyReport {
  readonly blockedTerms: readonly string[];
  readonly plagiarismDetected: boolean;
}

export function runModerationCheck(content: string): string[] {
  const lower = content.toLowerCase();
  return BLOCKED_TERMS.filter((term) => lower.includes(term));
}

export function runPlagiarismCheck(content: string, references: readonly string[]): boolean {
  const normalised = content.replace(/[^a-z0-9]+/gi, ' ').toLowerCase();
  return references.some((reference) => {
    const refNormalised = reference.replace(/[^a-z0-9]+/gi, ' ').toLowerCase();
    return refNormalised.length > 32 && normalised.includes(refNormalised.slice(0, 32));
  });
}

export function ensureContentSafe(content: string, references: readonly string[] = []): SafetyReport {
  const blocked = runModerationCheck(content);
  const plagiarismDetected = runPlagiarismCheck(content, references);
  if (blocked.length > 0) {
    throw new Error(`Content failed moderation: ${blocked.join(', ')}`);
  }
  if (plagiarismDetected) {
    throw new Error('Content flagged for plagiarism risk');
  }
  return { blockedTerms: blocked, plagiarismDetected };
}
