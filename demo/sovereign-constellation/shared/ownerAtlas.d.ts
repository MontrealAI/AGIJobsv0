declare module "./ownerAtlas.mjs" {
  export type OwnerAtlasAction = {
    method: string;
    description: string;
    args: string[];
    explorerWriteUrl: string;
    contractAddress: string;
  };

  export type OwnerAtlasModule = {
    module: string;
    address: string;
    actions: OwnerAtlasAction[];
  };

  export type OwnerAtlasHub = {
    hubId: string;
    label: string;
    chainId: number;
    networkName: string;
    owner: string;
    governance: string;
    explorer: string;
    modules: OwnerAtlasModule[];
  };

  export type UiConfig = {
    network: string;
    etherscanBase: string;
    defaultSubgraphUrl?: string;
    orchestratorBase?: string;
    hubs: string[];
    explorers?: Record<string, string>;
  };

  export type HubConfig = {
    label: string;
    chainId: number;
    networkName: string;
    rpcUrl: string;
    owner: string;
    governance: string;
    subgraphUrl?: string;
    addresses: Record<string, string>;
  };

  export function buildOwnerAtlas(
    hubs: Record<string, HubConfig>,
    uiConfig: UiConfig
  ): { atlas: OwnerAtlasHub[] };

  export function formatOwnerAtlasMarkdown(
    atlas: OwnerAtlasHub[],
    options?: { network?: string; generatedAt?: Date }
  ): string;
}
