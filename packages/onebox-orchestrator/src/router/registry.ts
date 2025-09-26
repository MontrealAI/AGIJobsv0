import type { AnyIntentEnvelope, IntentName } from '../ics/types';

export interface ToolExecutionContext {
  chainId: number;
  rpcUrl: string;
  identity?: {
    ensName?: string;
    address?: string;
  };
  requestMeta?: Record<string, unknown>;
}

export interface ToolResponse {
  status: 'success' | 'pending' | 'error';
  messages: string[];
  data?: Record<string, unknown>;
  issues?: string[];
}

export type ToolHandler<TIntent extends IntentName = IntentName> = (
  envelope: Extract<AnyIntentEnvelope, { intent: TIntent }>,
  context: ToolExecutionContext
) => Promise<ToolResponse>;

export class ToolRegistry {
  private readonly handlers: Map<IntentName, ToolHandler> = new Map();

  register<TIntent extends IntentName>(
    intent: TIntent,
    handler: ToolHandler<TIntent>
  ): void {
    this.handlers.set(intent, handler as ToolHandler);
  }

  has(intent: IntentName): boolean {
    return this.handlers.has(intent);
  }

  resolve(intent: IntentName): ToolHandler {
    const handler = this.handlers.get(intent);
    if (!handler) {
      throw new Error(`No tool handler registered for intent: ${intent}`);
    }
    return handler;
  }

  async dispatch(
    envelope: AnyIntentEnvelope,
    context: ToolExecutionContext
  ): Promise<ToolResponse> {
    const handler = this.resolve(envelope.intent);
    return handler(envelope, context);
  }
}

export function registerDefaultNotImplementedHandlers(
  registry: ToolRegistry
): void {
  const createHandler =
    (intent: IntentName): ToolHandler =>
    async () => ({
      status: 'error',
      messages: [
        `Intent \`${intent}\` is recognised but no execution adapter has been implemented yet. Please wire the blockchain adapter before enabling this pathway.`,
      ],
      issues: ['not_implemented'],
    });

  const intents: IntentName[] = [
    'create_job',
    'apply_job',
    'submit_work',
    'validate',
    'finalize',
    'dispute',
    'stake',
    'withdraw',
    'admin_set',
  ];

  intents.forEach((intent) => {
    if (!registry.has(intent)) {
      registry.register(intent, createHandler(intent));
    }
  });
}
