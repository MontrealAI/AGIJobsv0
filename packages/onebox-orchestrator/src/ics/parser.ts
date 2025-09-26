import { IntentConstraintSchema } from './schema';
import type {
  AnyIntentEnvelope,
  ConstraintForIntent,
  IntentConstraint,
  IntentName,
  IntentValidationResult,
} from './types';

const formatIssues = (issues: readonly { message: string; path: (string | number)[] }[]): string[] =>
  issues.map((issue) => {
    const path = issue.path.length ? ` at ${issue.path.join('.')}` : '';
    return `${issue.message}${path}`;
  });

export function parseIntentConstraint(input: unknown): IntentValidationResult {
  const result = IntentConstraintSchema.safeParse(input);

  if (!result.success) {
    return {
      ok: false,
      issues: formatIssues(result.error.issues),
    };
  }

  const constraint = result.data as IntentConstraint;

  if (constraint.confirmationText && !constraint.confirm) {
    return {
      ok: false,
      issues: ['confirmationText requires confirm=true'],
    };
  }

  const intentName = constraint.intent as IntentName;
  const typedConstraint = constraint as ConstraintForIntent<IntentName>;

  const envelope: AnyIntentEnvelope = {
    intent: intentName,
    payload: typedConstraint,
  };

  return {
    ok: true,
    data: envelope,
  };
}
