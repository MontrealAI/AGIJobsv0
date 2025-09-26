import type { IntentConstraint } from './schema';

export type IntentName = IntentConstraint['intent'];

export type ConfirmationMetadata = {
  confirm: boolean;
  confirmationText?: string;
};

export type IntentMeta = IntentConstraint['meta'];

export interface IntentEnvelope<TIntent extends IntentName = IntentName> {
  intent: TIntent;
  payload: IntentConstraint & { intent: TIntent };
}

export type AnyIntentEnvelope = {
  [K in IntentName]: IntentEnvelope<K>;
}[IntentName];

export interface IntentValidationResult {
  ok: boolean;
  data?: AnyIntentEnvelope;
  issues?: string[];
}
