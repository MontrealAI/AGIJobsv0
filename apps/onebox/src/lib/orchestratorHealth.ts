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
const AUTH_TOKEN_PATTERN = /^[A-Za-z0-9._~+/=:-]{1,512}$/;

const sanitizeAuthToken = (value?: string): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/[\r\n]/.test(trimmed)) {
    return undefined;
  }
  if (!AUTH_TOKEN_PATTERN.test(trimmed)) {
    return undefined;
  }
  return trimmed;
};

const buildHeaders = (apiToken?: string): HeadersInit | undefined => {
  const sanitizedToken = sanitizeAuthToken(apiToken);
  if (!sanitizedToken) {
    return undefined;
  }
  return {
    Authorization: `Bearer ${sanitizedToken}`,
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

  const sanitiseMetricsBase = (base: string): string => {
    const trimmed = base.replace(/\/+$/, '');
    if (trimmed.endsWith('/onebox')) {
      return trimmed.slice(0, -'/onebox'.length);
    }
    return trimmed;
  };

  const metricsUrl = `${sanitiseMetricsBase(orchestratorBase)}/metrics`;

  try {
    const response = await fetchImpl(metricsUrl, {
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
