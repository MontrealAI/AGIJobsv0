import type { z } from 'zod';
import type { IntentConstraintSchema, INTENT_VALUES } from './schema';

export type IntentName = (typeof INTENT_VALUES)[number];

export type IntentConstraint = z.infer<typeof IntentConstraintSchema>;

type ExtractConstraint<TIntent extends IntentName> = Extract<
  IntentConstraint,
  { intent: TIntent }
>;

export type ConstraintForIntent<TIntent extends IntentName> = [
  ExtractConstraint<TIntent>
] extends [never]
  ? (IntentConstraint & { intent: TIntent })
  : ExtractConstraint<TIntent>;

export interface IntentMeta {
  traceId?: string;
  userId?: string;
  planner?: string;
}

export type ConfirmationMetadata = Pick<IntentConstraint, 'confirm' | 'confirmationText'>;

export interface IntentEnvelope<TIntent extends IntentName = IntentName> {
  intent: TIntent;
  payload: ConstraintForIntent<TIntent>;
}

export type AnyIntentEnvelope = IntentEnvelope<IntentName>;

export interface IntentValidationSuccess<TIntent extends IntentName = IntentName> {
  ok: true;
  data: IntentEnvelope<TIntent>;
  issues?: undefined;
}

export interface IntentValidationFailure {
  ok: false;
  data?: undefined;
  issues: string[];
}

export type IntentValidationResult<TIntent extends IntentName = IntentName> =
  | IntentValidationSuccess<TIntent>
  | IntentValidationFailure;
