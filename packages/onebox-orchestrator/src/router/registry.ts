import { INTENT_VALUES } from '../ics/schema';
import type { AnyIntentEnvelope, IntentName } from '../ics/types';

export type ToolResponseStatus = 'success' | 'error' | 'not_implemented';

export interface ToolResponse {
  status: ToolResponseStatus;
  message: string;
  data?: unknown;
  issues?: string[];
}

export interface ToolExecutionContext {
  traceId?: string;
  logger?: {
    debug: (message: string, metadata?: Record<string, unknown>) => void;
    info: (message: string, metadata?: Record<string, unknown>) => void;
    warn: (message: string, metadata?: Record<string, unknown>) => void;
    error: (message: string, metadata?: Record<string, unknown>) => void;
  };
}

export type ToolHandler<TEnvelope extends AnyIntentEnvelope = AnyIntentEnvelope> = (
  envelope: TEnvelope,
  context: ToolExecutionContext
) => Promise<ToolResponse> | ToolResponse;

export class ToolRegistry {
  private readonly handlers = new Map<IntentName, ToolHandler>();

  register<TIntent extends IntentName>(intent: TIntent, handler: ToolHandler<AnyIntentEnvelope>): void {
    this.handlers.set(intent, handler);
  }

  get(intent: IntentName): ToolHandler<AnyIntentEnvelope> | undefined {
    return this.handlers.get(intent);
  }

  async execute(envelope: AnyIntentEnvelope, context: ToolExecutionContext = {}): Promise<ToolResponse> {
    const handler = this.handlers.get(envelope.intent);

    if (!handler) {
      return {
        status: 'not_implemented',
        message: `No handler registered for ${envelope.intent}`,
        issues: [`${envelope.intent} is not supported`],
      };
    }

    try {
      const result = await handler(envelope, context);
      return result;
    } catch (error) {
      context.logger?.error('Tool execution failed', {
        intent: envelope.intent,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        status: 'error',
        message: 'Tool execution failed',
        issues: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }
}

export function registerDefaultNotImplementedHandlers(registry: ToolRegistry): void {
  for (const intent of INTENT_VALUES) {
    if (registry.get(intent)) {
      continue;
    }

    registry.register(intent, async () => ({
      status: 'not_implemented',
      message: `${intent} is not implemented yet`,
      issues: [`${intent} handler missing`],
    }));
  }
}
