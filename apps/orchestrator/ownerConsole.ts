import {
  loadGovernanceSnapshot,
  previewGovernanceAction,
  type GovernancePreview,
} from '../../packages/orchestrator/src/tools/governance.js';

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

