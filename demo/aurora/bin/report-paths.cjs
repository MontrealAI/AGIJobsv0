function resolveNamespace(scope, env = process.env) {
  const raw = env.AURORA_REPORT_NAMESPACE?.trim() || scope;
  if (!/^[A-Za-z0-9_.-]+$/.test(raw) || raw === '.' || raw === '..') {
    throw new Error(
      `Invalid report namespace: ${raw}. Use letters, numbers, '-', '_' or '.'.`
    );
  }
  return raw;
}

module.exports = { resolveNamespace };
