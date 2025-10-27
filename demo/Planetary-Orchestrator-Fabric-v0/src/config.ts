import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface FabricConfig {
  owner: {
    name: string;
    address: string;
    contact?: string;
  };
  checkpoint: {
    directory: string;
    intervalTicks: number;
    retain: number;
  };
  shards: Array<{
    id: string;
    label: string;
    maxQueueDepth: number;
    spilloverTargets: string[];
    spilloverThreshold: number;
  }>;
  routers: {
    heartbeatGraceTicks: number;
    spilloverBatch: number;
    maxConcurrentAssignmentsPerNode: number;
  };
  nodes: Array<{
    id: string;
    shard: string;
    capabilities: string[];
    maxConcurrency: number;
    reliability: number;
  }>;
  jobTemplates: Record<
    string,
    {
      durationTicks: number;
      payout: string;
      validatorQuorum: number;
      capabilities: string[];
    }
  >;
}

export const loadConfig = (configPath: string): FabricConfig => {
  const absolutePath = path.resolve(configPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Fabric config not found at ${absolutePath}`);
  }
  const config: FabricConfig = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  validateConfig(config, absolutePath);
  return config;
};

export const hashConfig = (config: FabricConfig): string => {
  const ordered = JSON.stringify(config, Object.keys(config).sort());
  return crypto.createHash('sha256').update(ordered).digest('hex');
};

const validateConfig = (config: FabricConfig, location: string): void => {
  if (!config.owner?.address) {
    throw new Error(`owner.address missing in ${location}`);
  }
  if (!config.shards?.length) {
    throw new Error(`no shards defined in ${location}`);
  }
  const shardIds = new Set(config.shards.map((s) => s.id));
  for (const shard of config.shards) {
    if (shard.spilloverTargets.some((id) => !shardIds.has(id))) {
      throw new Error(`Shard ${shard.id} references unknown spillover target in ${location}`);
    }
  }
  for (const node of config.nodes) {
    if (!shardIds.has(node.shard)) {
      throw new Error(`Node ${node.id} references unknown shard ${node.shard}`);
    }
    if (node.reliability <= 0 || node.reliability > 1) {
      throw new Error(`Node ${node.id} reliability must be between 0 and 1`);
    }
  }
  if (!config.checkpoint?.directory) {
    throw new Error(`Checkpoint directory missing in ${location}`);
  }
};
