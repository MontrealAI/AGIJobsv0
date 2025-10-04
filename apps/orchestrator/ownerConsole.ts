type GovernancePreview = {
  summary?: string;
  warnings?: string[];
  details?: Record<string, unknown>;
};

const governanceTools = require('../../packages/orchestrator/src/tools/governance.js') as {
  loadGovernanceSnapshot: () => Promise<Record<string, unknown>>;
  previewGovernanceAction: (input: {
    key: string;
    value: unknown;
    meta?: Record<string, unknown>;
    persist?: boolean;
  }) => Promise<GovernancePreview>;
};

const { loadGovernanceSnapshot, previewGovernanceAction } = governanceTools;

export interface OwnerPreviewRequest {
  key: string;
  value: unknown;
  meta?: {
    traceId?: string;
    userId?: string;
    safe?: string;
  };
  persist?: boolean;
}

export async function ownerGovernanceSnapshot() {
  return loadGovernanceSnapshot();
}

export async function ownerPreviewAction(request: OwnerPreviewRequest): Promise<GovernancePreview> {
  return previewGovernanceAction({
    key: request.key,
    value: request.value,
    meta: request.meta,
    persist: request.persist ?? true,
  });
}

