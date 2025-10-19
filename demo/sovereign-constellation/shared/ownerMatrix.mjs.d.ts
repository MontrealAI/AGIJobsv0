export type OwnerMatrixEntry = {
  id: string;
  pillarId: string;
  title: string;
  hub: string;
  module: string;
  method: string;
  ownerAction: string;
  operatorSignal: string;
  proof: string;
  automation?: string[];
  notes?: string[];
};

export type OwnerMatrixResolved = OwnerMatrixEntry & {
  hubLabel?: string;
  networkName?: string;
  contractAddress?: string;
  explorerWriteUrl?: string;
  available: boolean;
  status: string;
  resolvedAt: string;
  atlasModules?: string[];
  atlasActions?: string[];
};

export declare function buildOwnerCommandMatrix(
  entries: OwnerMatrixEntry[],
  atlas: { atlas: any[] }
): OwnerMatrixResolved[];

export declare function summarizeAvailability(matrix: OwnerMatrixResolved[]): {
  ready: number;
  pending: number;
  pendingReasons: Record<string, number>;
};

export declare function formatOwnerCommandMatrixForCli(
  matrix: OwnerMatrixResolved[],
  options?: Record<string, any>
): string;
