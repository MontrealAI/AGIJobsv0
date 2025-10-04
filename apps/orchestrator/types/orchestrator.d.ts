declare module '../../packages/orchestrator/src/tools/governance.js' {
  export interface GovernancePreview {
    summary?: string;
    warnings?: string[];
    details?: Record<string, unknown>;
  }

  export function loadGovernanceSnapshot(): Promise<Record<string, unknown>>;
  export function previewGovernanceAction(input: {
    key: string;
    value: unknown;
    meta?: Record<string, unknown>;
    persist?: boolean;
  }): Promise<GovernancePreview>;
}

declare module '../../packages/orchestrator/src/chain/metadata.js' {
  export function loadChainMetadata(): Promise<Record<string, unknown>>;
}

declare module '../../packages/orchestrator/src/chain/metadata.ts' {
  export function loadChainMetadata(): Promise<Record<string, unknown>>;
}

declare module '../../packages/orchestrator/src/chain/metadata' {
  export function loadChainMetadata(): Promise<Record<string, unknown>>;
}
