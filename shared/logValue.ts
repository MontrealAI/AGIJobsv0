/** One JSON value per console argument: controls cannot forge log lines. */
export function logValue(value: unknown): string {
  try {
    return JSON.stringify(value instanceof Error ? { name: value.name, message: value.message } : value) ?? 'null';
  } catch { return '"[unserializable]"'; }
}
