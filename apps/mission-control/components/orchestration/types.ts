import { ComponentType, ReactNode } from 'react';

export type ShardStatus = {
  id: string;
  temperature: string;
  health: 'Nominal' | 'Degraded' | 'Critical';
  load: number;
  jobsActive: number;
  latencyMs: number;
  anomalies: string[];
};

export type MarketplaceNode = {
  id: string;
  operator: string;
  specialization: string;
  credibility: number;
  slotPrice: number;
  eta: string;
  status: 'Available' | 'Negotiating' | 'Queued';
};

export type JobMetric = {
  label: string;
  value: string;
  delta: string;
};

export type StoryScenario = {
  id: string;
  title: string;
  summary: string;
  steps: ReactNode[];
};

export type FlowTab = {
  id: string;
  title: string;
  icon: ComponentType;
  chart: string;
  caption: string;
};
