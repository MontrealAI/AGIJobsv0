import type { LaunchCommand } from "../server/index";

export type LaunchManifestContext = {
  deck?: any;
  missionProfiles?: any[];
  systems?: any[];
  victoryPlan?: any;
  telemetry?: any;
  ownerMatrixEntries?: any[];
  hubs?: Record<string, any>;
  uiConfig?: any;
};

export type LaunchManifestLibraries = {
  buildOwnerAtlas: (hubs: Record<string, any>, uiConfig: any) => any;
  buildOwnerCommandMatrix: (entries: any[], atlas: any) => any[];
  formatOwnerCommandMatrixForCli: (entries: any[], options?: Record<string, any>) => string;
  computeAutotunePlan: (telemetry: any, options?: Record<string, any>) => any;
};

export type LaunchManifestThermostat = {
  summary: {
    averageParticipation: number | null;
    commitWindowSeconds: number | null;
    revealWindowSeconds: number | null;
    minStakeWei: string | null;
    notes: string[];
  };
  actions: any[];
};

export type LaunchManifestResult = {
  generatedAt: string;
  mission: {
    title: string;
    tagline: string;
    promise: string;
    scope: string;
    unstoppable: string;
  };
  automation: {
    commands: LaunchCommand[];
    ci: { description: string; ownerVisibility: string } | null;
  };
  thermostat: LaunchManifestThermostat;
  ownerSummary: { ready: number; pending: number; pendingReasons: Record<string, number> };
  ownerMatrix: any[];
  ownerMatrixCli: string;
  markdown: string;
  preview: string[];
};

export declare function buildAsiLaunchManifest(
  context: LaunchManifestContext,
  libs: LaunchManifestLibraries
): LaunchManifestResult;
