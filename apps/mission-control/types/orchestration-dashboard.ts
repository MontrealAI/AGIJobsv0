export type ShardHealth = 'Nominal' | 'Degraded' | 'Critical';

export interface ShardStatus {
  id: string;
  temperatureC: number;
  health: ShardHealth;
  load: number;
  jobsActive: number;
  latencyMs: number;
  anomalies: string[];
}

export interface MarketplaceNode {
  id: string;
  operator: string;
  specialization: string;
  credibility: number;
  slotPrice: number;
  eta: string;
  status: 'Available' | 'Negotiating' | 'Queued';
}

export interface JobMetric {
  label: string;
  value: string;
  delta: string;
}

export interface ScenarioAsset {
  label: string;
  href: string;
}

export interface StoryScenario {
  slug: string;
  title: string;
  summary: string;
  steps: string[];
  assets?: ScenarioAsset[];
}

export interface DashboardFlows {
  orchestrator: string;
  upgrade: string;
  storytelling: string;
}

export interface MissionControlDashboard {
  shards: ShardStatus[];
  marketplace: MarketplaceNode[];
  jobMetrics: JobMetric[];
  flows: DashboardFlows;
  scenarios: StoryScenario[];
  tip?: string;
}
