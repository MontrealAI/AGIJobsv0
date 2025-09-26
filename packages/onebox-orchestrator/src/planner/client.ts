import { parseIntentConstraint } from '../ics/parser';
import type { AnyIntentEnvelope } from '../ics/types';

export interface PlannerClientOptions {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface PlannerRequestPayload {
  message: string;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: Record<string, unknown>;
}

export class PlannerClientError extends Error {
  public readonly status?: number;
  public readonly issues?: string[];

  constructor(
    message: string,
    options?: { status?: number; issues?: string[] }
  ) {
    super(message);
    this.name = 'PlannerClientError';
    this.status = options?.status;
    this.issues = options?.issues;
  }
}

export class PlannerClient {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: PlannerClientOptions) {
    if (!options.endpoint) {
      throw new PlannerClientError('Planner endpoint is required');
    }
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchFn = options.fetchImpl ?? fetch;
  }

  async plan(request: PlannerRequestPayload): Promise<AnyIntentEnvelope> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new PlannerClientError(
          `Planner responded with status ${response.status}`,
          { status: response.status }
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new PlannerClientError(
          'Planner response must be application/json'
        );
      }

      const payload = (await response.json()) as unknown;
      const validation = parseIntentConstraint(payload);
      if (!validation.ok || !validation.data) {
        throw new PlannerClientError('Planner response failed ICS validation', {
          issues: validation.issues,
        });
      }

      return validation.data;
    } catch (error) {
      if (error instanceof PlannerClientError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new PlannerClientError('Planner request timed out', {
          issues: [error.message],
        });
      }

      throw new PlannerClientError('Unexpected planner error', {
        issues: [error instanceof Error ? error.message : String(error)],
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
