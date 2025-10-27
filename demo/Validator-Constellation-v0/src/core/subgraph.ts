import { eventBus } from './eventBus';
import { EntropyWitness, SubgraphRecord } from './types';

export class SubgraphIndexer {
  private records: SubgraphRecord[] = [];
  private blockCounter = 1;

  constructor() {
    eventBus.on('StakeSlashed', (event) => this.pushRecord('SLASHING', event));
    eventBus.on('DomainPaused', (event) => this.pushRecord('PAUSE', event));
    eventBus.on('CommitLogged', (event) => this.pushRecord('COMMIT', event));
    eventBus.on('RevealLogged', (event) => this.pushRecord('REVEAL', event));
    eventBus.on('ZkBatchFinalized', (event) => this.pushRecord('ZK_BATCH', event));
    eventBus.on('VrfWitnessComputed', (event: EntropyWitness) =>
      this.pushRecord('VRF_WITNESS', {
        ...event,
        sources: [...event.sources],
      }),
    );
  }

  private pushRecord(type: SubgraphRecord['type'], payload: Record<string, unknown>): void {
    const record: SubgraphRecord = {
      id: `${type}-${this.blockCounter}`,
      type,
      blockNumber: this.blockCounter++,
      payload,
    };
    this.records.push(record);
  }

  list(): SubgraphRecord[] {
    return this.records.map((record) => ({ ...record, payload: { ...record.payload } }));
  }

  filter(type: SubgraphRecord['type']): SubgraphRecord[] {
    return this.records.filter((record) => record.type === type).map((record) => ({ ...record, payload: { ...record.payload } }));
  }

  clear(): void {
    this.records = [];
    this.blockCounter = 1;
  }
}

export const subgraphIndexer = new SubgraphIndexer();
