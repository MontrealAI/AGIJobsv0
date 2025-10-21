'use client';

export type OrchestratorHealthStatus = 'missing' | 'ready' | 'error';

export type OrchestratorHealthResult =
  | { status: 'missing'; error: null }
  | { status: 'ready'; error: null }
  | { status: 'error'; error: string };

export type OrchestratorHealthOptions = {
  orchestratorBase?: string | null;
  apiToken?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 5000;

const buildHeaders = (apiToken?: string): HeadersInit | undefined => {
  if (!apiToken) {
    return undefined;
  }
  return {
    Authorization: `Bearer ${apiToken}`,
  };
};

export const checkOrchestratorHealth = async (
  options: OrchestratorHealthOptions
): Promise<OrchestratorHealthResult> => {
  const { orchestratorBase, apiToken, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } =
    options;

  if (!orchestratorBase) {
    return { status: 'missing', error: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(`${orchestratorBase}/metrics`, {
      method: 'GET',
      headers: buildHeaders(apiToken),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { status: 'error', error: `HTTP ${response.status}` };
    }

    return { status: 'ready', error: null };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to reach orchestrator metrics endpoint.';
    return { status: 'error', error: message };
  } finally {
    clearTimeout(timeout);
  }
};
