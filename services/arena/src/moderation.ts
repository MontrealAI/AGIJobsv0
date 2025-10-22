import type { ModerationResult } from './types.js';

const bannedPhrases = ['hate speech', 'terrorism', 'malware'];

export class ModerationService {
  constructor(private readonly externalEndpoint?: string) {}

  async review(text: string): Promise<ModerationResult> {
    if (this.externalEndpoint) {
      try {
        const response = await fetch(this.externalEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: text })
        });
        const json = (await response.json()) as { flagged?: boolean; reason?: string };
        return {
          flagged: Boolean(json.flagged),
          reason: json.reason
        };
      } catch (error) {
        console.warn('Moderation API failure, falling back to rules', error);
      }
    }

    const lowered = text.toLowerCase();
    for (const phrase of bannedPhrases) {
      if (lowered.includes(phrase)) {
        return {
          flagged: true,
          reason: `Detected banned phrase: ${phrase}`
        };
      }
    }
    return { flagged: false };
  }
}
