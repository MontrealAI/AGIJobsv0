import { randomInt } from 'node:crypto';

import type {
  ActiveAssignment,
  FabricEvent,
  JobRecord,
  NodeDescriptor,
  NodeRuntimeState,
  ShardId,
} from './types';

export interface NodeMarketplaceOptions {
  readonly tick: number;
}

interface CapacityBoost {
  readonly multiplier: number;
  remainingTicks: number;
}

export class NodeMarketplace {
  private readonly nodes: Map<string, NodeRuntimeState> = new Map();

  private readonly boosts: Map<string, CapacityBoost> = new Map();

  constructor(
    descriptors: ReadonlyArray<NodeDescriptor>,
    private readonly eventSink: (event: FabricEvent) => void,
    options: NodeMarketplaceOptions
  ) {
    descriptors.forEach((descriptor) => {
      this.nodes.set(descriptor.id, {
        descriptor,
        status: 'active',
        heartbeatTick: options.tick,
        assignments: [],
        downtimeTicks: 0,
        totalCompleted: 0,
        totalFailed: 0,
        spilloversHandled: 0,
      });
    });
  }

  public listNodes(): NodeRuntimeState[] {
    return [...this.nodes.values()];
  }

  public getNode(id: string): NodeRuntimeState | undefined {
    return this.nodes.get(id);
  }

  public allocate(
    job: JobRecord,
    preferredShard: ShardId
  ): NodeRuntimeState | undefined {
    const candidates = this.listNodes()
      .filter((node) => node.status === 'active')
      .filter(
        (node) => node.assignments.length < this.getEffectiveCapacity(node)
      )
      .filter((node) =>
        node.descriptor.specialties.includes(job.payload.category)
      );

    const sorted = candidates.sort((a, b) => {
      const sameRegionA = a.descriptor.region === preferredShard ? 0 : 1;
      const sameRegionB = b.descriptor.region === preferredShard ? 0 : 1;
      if (sameRegionA !== sameRegionB) {
        return sameRegionA - sameRegionB;
      }
      const capacityA = this.getEffectiveCapacity(a) - a.assignments.length;
      const capacityB = this.getEffectiveCapacity(b) - b.assignments.length;
      if (capacityA !== capacityB) {
        return capacityB - capacityA;
      }
      return b.descriptor.performance - a.descriptor.performance;
    });

    return sorted[0];
  }

  public getEffectiveCapacity(node: NodeRuntimeState): number {
    const boost = this.boosts.get(node.descriptor.id);
    if (!boost) {
      return node.descriptor.capacity;
    }
    return Math.ceil(node.descriptor.capacity * boost.multiplier);
  }

  public heartbeat(nodeId: string, tick: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Unknown node ${nodeId}`);
    }
    node.heartbeatTick = tick;
    if (node.status === 'offline') {
      node.status = 'recovering';
      this.eventSink({
        type: 'node:recovered',
        tick,
        details: { nodeId },
      });
    }
    this.eventSink({
      type: 'node:heartbeat',
      tick,
      details: { nodeId },
    });
  }

  public assign(node: NodeRuntimeState, job: JobRecord): void {
    const existing = node.assignments.find(
      (assignment) => assignment.jobId === job.id
    );
    if (existing) {
      return;
    }
    const assignment: ActiveAssignment = {
      jobId: job.id,
      progress: 0,
      workRemaining: job.workRemaining,
    };
    node.assignments.push(assignment);
  }

  public complete(nodeId: string, jobId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return;
    }
    node.assignments = node.assignments.filter(
      (assignment) => assignment.jobId !== jobId
    );
    node.totalCompleted += 1;
  }

  public fail(nodeId: string, jobId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return;
    }
    node.assignments = node.assignments.filter(
      (assignment) => assignment.jobId !== jobId
    );
    node.totalFailed += 1;
  }

  public spilloverHandled(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return;
    }
    node.spilloversHandled += 1;
  }

  public simulateReliability(
    tick: number
  ): Array<{ nodeId: string; jobIds: string[] }> {
    const lostAssignments: Array<{ nodeId: string; jobIds: string[] }> = [];
    this.nodes.forEach((node) => {
      if (node.status === 'offline') {
        node.downtimeTicks += 1;
      }
      if (node.status !== 'active') {
        return;
      }
      const threshold = Math.floor(node.descriptor.reliability * 1000);
      const roll = randomInt(0, 1000);
      if (roll > threshold) {
        node.status = 'offline';
        node.downtimeTicks += 1;
        const lost = [...node.assignments];
        node.assignments = [];
        if (lost.length > 0) {
          lostAssignments.push({
            nodeId: node.descriptor.id,
            jobIds: lost.map((assignment) => assignment.jobId),
          });
        }
        this.eventSink({
          type: 'node:offline',
          tick,
          details: { nodeId: node.descriptor.id, lostAssignments: lost.length },
        });
      }
    });
    return lostAssignments;
  }

  public updateBoosts(): void {
    this.boosts.forEach((boost, nodeId) => {
      boost.remainingTicks -= 1;
      if (boost.remainingTicks <= 0) {
        this.boosts.delete(nodeId);
      }
    });
  }

  public applyBoost(
    nodeId: string,
    multiplier: number,
    duration: number
  ): void {
    if (!this.nodes.has(nodeId)) {
      throw new Error(`Cannot boost missing node ${nodeId}`);
    }
    this.boosts.set(nodeId, { multiplier, remainingTicks: duration });
  }

  public adoptSnapshot(snapshot: Record<string, NodeRuntimeState>): void {
    this.nodes.clear();
    Object.entries(snapshot).forEach(([id, node]) => {
      this.nodes.set(id, {
        ...node,
        assignments: node.assignments.map((assignment) => ({ ...assignment })),
      });
    });
  }
}
