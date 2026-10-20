/** Canonical local identity label shared by spawn and registration boundaries. */
export const MAX_AGENT_LABEL_LENGTH = 63;

export function validateAgentLabel(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_AGENT_LABEL_LENGTH ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error('Invalid identity label: use 1..63 lowercase letters, digits and single internal hyphens');
  }
  return value;
}
