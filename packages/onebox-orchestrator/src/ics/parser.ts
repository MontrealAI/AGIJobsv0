import { IntentConstraintSchema } from './schema';
import type { AnyIntentEnvelope, IntentValidationResult } from './types';

export function parseIntentConstraint(input: unknown): IntentValidationResult {
  const result = IntentConstraintSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    return { ok: false, issues };
  }

  const { data } = result;
  const envelope = {
    intent: data.intent,
    payload: data,
  } as AnyIntentEnvelope;

  if (data.confirmationText && data.confirm !== true) {
    return {
      ok: false,
      issues: [
        'confirmationText provided without confirm=true. The planner must request explicit confirmation when providing natural-language summaries.',
      ],
    };
  }

  return { ok: true, data: envelope };
}
