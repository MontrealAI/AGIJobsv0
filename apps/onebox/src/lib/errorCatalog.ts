import errorCatalogData from '../../../../storage/errors/onebox.json';

type ErrorCatalog = Record<string, string>;

type StatusCodeMap = Record<number, string>;

type ErrorLike = {
  code?: string;
  status?: number;
  message?: string;
  detail?: string;
};

const catalog: ErrorCatalog = errorCatalogData as ErrorCatalog;

const STATUS_TO_CODE: StatusCodeMap = {
  400: 'REQUEST_EMPTY',
  401: 'API_TOKEN_INVALID',
  403: 'AUTH_MISSING',
  404: 'PLAN_HASH_REQUIRED',
  409: 'PLAN_GUARDRAILS',
  410: 'PLAN_MISSING_INFO',
  412: 'PLAN_GUARDRAILS',
  422: 'SIMULATION_BLOCKED',
  423: 'SYSTEM_PAUSED',
  424: 'EXECUTION_REVERTED',
  429: 'ESCROW_BALANCE_LOW',
  500: 'RUN_FAILED',
  503: 'STATUS_UNREACHABLE',
};

export class OrchestratorError extends Error {
  public readonly code?: string;
  public readonly status?: number;
  public readonly detail?: string;

  constructor(message: string, options: ErrorLike = {}) {
    super(message);
    this.name = 'OrchestratorError';
    this.code = options.code;
    this.status = options.status;
    this.detail = options.detail;
  }
}

const findCatalogEntry = (code?: string) =>
  code && code in catalog ? catalog[code] : undefined;

const heuristics = (message?: string): string | undefined => {
  if (!message) {
    return undefined;
  }
  const lower = message.toLowerCase();
  if (lower.includes('paused')) {
    return catalog.SYSTEM_PAUSED;
  }
  if (lower.includes('guardrail')) {
    return catalog.PLAN_GUARDRAILS;
  }
  if (lower.includes('missing') && lower.includes('field')) {
    return catalog.PLAN_MISSING_INFO;
  }
  if (lower.includes('revert')) {
    return catalog.EXECUTION_REVERTED;
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return catalog.STATUS_UNREACHABLE;
  }
  return undefined;
};

export const resolveFriendlyError = (
  error: unknown,
  fallback?: string
): string => {
  if (error instanceof OrchestratorError) {
    const primary = findCatalogEntry(error.code ?? STATUS_TO_CODE[error.status ?? 0]);
    if (primary) {
      return primary;
    }
    const secondary = heuristics(error.message) ?? heuristics(error.detail);
    if (secondary) {
      return secondary;
    }
  }
  if (typeof error === 'object' && error && 'code' in error) {
    const maybe = error as ErrorLike;
    const primary = findCatalogEntry(maybe.code ?? STATUS_TO_CODE[maybe.status ?? 0]);
    if (primary) {
      return primary;
    }
    const secondary = heuristics(maybe.message ?? maybe.detail);
    if (secondary) {
      return secondary;
    }
  }
  if (fallback && fallback.trim().length > 0) {
    return fallback;
  }
  if (error instanceof Error && error.message) {
    const byMessage = heuristics(error.message);
    if (byMessage) {
      return byMessage;
    }
    return error.message;
  }
  return catalog.UNKNOWN;
};

export const responseToError = async (response: Response): Promise<never> => {
  const status = response.status;
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (error) {
    parsed = null;
  }
  let code: string | undefined;
  let message: string | undefined;
  let detail: string | undefined;
  if (parsed && typeof parsed === 'object') {
    const data = parsed as Record<string, unknown>;
    if (typeof data.code === 'string') {
      code = data.code;
    }
    if (typeof data.error === 'string' && !message) {
      message = data.error;
    }
    if (typeof data.message === 'string') {
      message = data.message;
    }
    if (typeof data.detail === 'string') {
      detail = data.detail;
    }
    if (!code && typeof data.status === 'string') {
      code = data.status;
    }
  }
  const reason = message ?? `Request failed with status ${status}`;
  throw new OrchestratorError(reason, { code, status, detail });
};

export const simulationBlockersToError = (blockers: string[]): OrchestratorError => {
  const detail = blockers.join(', ');
  return new OrchestratorError('Simulation blocked by guardrails.', {
    code: 'SIMULATION_BLOCKED',
    status: 422,
    detail,
  });
};

export const missingFieldsToError = (fields: string[]): OrchestratorError => {
  const detail = fields.join(', ');
  return new OrchestratorError('Missing required fields.', {
    code: 'PLAN_MISSING_INFO',
    status: 410,
    detail,
  });
};
