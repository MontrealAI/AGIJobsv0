import { invokeAgentEndpoint } from '../../agent-gateway/agentEndpoint';

/** Exact destinations are operator configuration, never authority supplied by a job. */
export function normalizeAgentEndpoint(value: string): string {
  const url = new URL(value);
  const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error(
      'Agent endpoint requires HTTPS (or literal loopback HTTP), without credentials, query or fragment'
    );
  return url.href;
}

export function approveAgentEndpoint(endpoint: string): string {
  const approved: unknown = JSON.parse(
    process.env.ORCHESTRATOR_AGENT_ENDPOINTS || '[]'
  );
  if (!Array.isArray(approved) || !approved.every((x) => typeof x === 'string'))
    throw new Error(
      'ORCHESTRATOR_AGENT_ENDPOINTS must be a JSON array of exact URLs'
    );
  const target = normalizeAgentEndpoint(endpoint);
  if (!approved.map(normalizeAgentEndpoint).includes(target))
    throw new Error('Agent endpoint is not approved by the operator');
  return target;
}

export async function invokeApprovedAgent(
  endpoint: string,
  payload: unknown
): Promise<unknown> {
  const target = approveAgentEndpoint(endpoint);
  const body = JSON.stringify(payload ?? {}, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
  if (Buffer.byteLength(body) > 1024 * 1024)
    throw new Error('Agent request exceeds the size limit');
  return invokeAgentEndpoint(target, JSON.parse(body), 30_000);
}
