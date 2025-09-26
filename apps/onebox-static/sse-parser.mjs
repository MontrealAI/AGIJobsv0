export function sanitizeSSEChunk(chunk) {
  if (!chunk) return "";
  const withoutPrefix = chunk.startsWith("data:") ? chunk.slice(5) : chunk;
  return withoutPrefix.trim();
}

export function drainSSEBuffer(buffer, onChunk) {
  let normalized = buffer.replace(/\r\n/g, "\n");
  let boundary = normalized.indexOf("\n\n");
  while (boundary !== -1) {
    const chunk = normalized.slice(0, boundary).trim();
    if (chunk) {
      onChunk(chunk);
    }
    normalized = normalized.slice(boundary + 2);
    boundary = normalized.indexOf("\n\n");
  }
  return normalized;
}
