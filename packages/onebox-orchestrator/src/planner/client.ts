import { setTimeout as nodeSetTimeout, clearTimeout as nodeClearTimeout } from 'node:timers';
import { parseIntentConstraint } from '../ics/parser';
import type { IntentValidationResult } from '../ics/types';

export interface PlannerMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PlannerClientOptions {
  endpoint?: string;
  apiKey?: string;
  requestTimeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

export interface PlannerPlanResult {
  source: 'remote' | 'fallback';
  rawText: string;
  intent: IntentValidationResult;
  message?: string;
}

export class PlannerClientError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PlannerClientError';
    this.cause = cause;
  }
}

export class PlannerClient {
  private readonly endpoint?: string;
  private readonly apiKey?: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: PlannerClientOptions = {}) {
    this.endpoint = options.endpoint ?? process.env.ALPHA_ORCHESTRATOR_URL;
    this.apiKey = options.apiKey ?? process.env.ALPHA_ORCHESTRATOR_TOKEN;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 20_000;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  static fromEnv(overrides: PlannerClientOptions = {}): PlannerClient {
    return new PlannerClient(overrides);
  }

  async plan(messages: PlannerMessage[]): Promise<PlannerPlanResult> {
    if (this.endpoint) {
      try {
        return await this.planRemote(messages);
      } catch (error) {
        return {
          source: 'fallback',
          rawText: '',
          intent: {
            ok: false,
            issues: ['Planner endpoint error: falling back to local heuristics'],
          },
          message: error instanceof Error ? error.message : 'Unknown planner error',
        };
      }
    }

    return this.planFallback(messages);
  }

  private async planRemote(messages: PlannerMessage[]): Promise<PlannerPlanResult> {
    const controller = new AbortController();
    const timeout = nodeSetTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImplementation(this.endpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new PlannerClientError(`Planner responded with ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      let rawText = '';

      if (contentType?.includes('application/json')) {
        const parsed = (await response.json()) as { output?: unknown };
        rawText = typeof parsed.output === 'string' ? parsed.output : JSON.stringify(parsed.output);
      } else {
        rawText = await response.text();
      }

      const intent = this.tryParseIntent(rawText);

      return {
        source: 'remote',
        rawText,
        intent,
        message: intent.ok
          ? undefined
          : intent.issues[0] ?? 'Planner response did not match the expected schema',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PlannerClientError('Planner request timed out', error);
      }

      throw new PlannerClientError('Planner request failed', error);
    } finally {
      nodeClearTimeout(timeout);
    }
  }

  private planFallback(messages: PlannerMessage[]): PlannerPlanResult {
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user')?.content.trim();

    if (!lastUserMessage) {
      return {
        source: 'fallback',
        rawText: '',
        intent: {
          ok: false,
          issues: ['No user message provided'],
        },
        message: 'I did not receive a prompt to act on. Please describe what you would like to do.',
      };
    }

    try {
      const maybeJson = JSON.parse(lastUserMessage) as unknown;
      const intent = this.tryParseIntent(maybeJson);

      return {
        source: 'fallback',
        rawText: typeof maybeJson === 'string' ? maybeJson : JSON.stringify(maybeJson),
        intent,
        message: intent.ok
          ? 'Parsed intent using local JSON parser. Configure AGI-Alpha to enable full planning.'
          : intent.issues[0] ?? 'Provided JSON did not match the intent schema',
      };
    } catch (error) {
      const hints = this.generateHeuristicHint(lastUserMessage);
      return {
        source: 'fallback',
        rawText: lastUserMessage,
        intent: {
          ok: false,
          issues: [
            'Planner endpoint is not configured. Provide JSON matching the intent schema or set ALPHA_ORCHESTRATOR_URL.',
          ],
        },
        message: hints,
      };
    }
  }

  private tryParseIntent(input: unknown): IntentValidationResult {
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input) as unknown;
        return parseIntentConstraint(parsed);
      } catch (error) {
        return {
          ok: false,
          issues: [`Planner returned non-JSON string: ${error instanceof Error ? error.message : 'unknown error'}`],
        };
      }
    }

    return parseIntentConstraint(input);
  }

  private generateHeuristicHint(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('post') || lower.includes('create')) {
      return 'To create a job, provide JSON like {"intent":"create_job", "params": {"job": {"title": "...", "description": "...", "rewardAmount": "10", "deadlineDays": 7}}, "confirm": true, "confirmationText": "Post job ..."}';
    }

    if (lower.includes('apply')) {
      return 'To apply, try: {"intent":"apply_job","params":{"jobId":1,"ensName":"alice.agent.agi.eth"},"confirm":true,"confirmationText":"Apply to job #1"}';
    }

    return 'Configure ALPHA_ORCHESTRATOR_URL to enable natural language planning, or paste a JSON intent following the documented schema.';
  }
}
