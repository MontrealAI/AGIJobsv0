declare module '../../../../../shared/structuredLogger.js' {
  export interface StructuredLogInput {
    readonly component: string;
    readonly action: string;
    readonly level?: string;
    readonly details?: Record<string, unknown>;
    readonly actor?: string;
    readonly jobId?: string;
  }

  export function buildStructuredLogRecord(input: StructuredLogInput): Record<string, unknown>;
}
