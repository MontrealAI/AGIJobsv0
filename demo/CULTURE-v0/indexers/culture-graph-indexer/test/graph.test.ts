import { afterEach, describe, expect, it } from 'vitest';
import { GraphStore } from '../src/graph.js';

function createStore() {
  return new GraphStore(':memory:');
}

describe('GraphStore', () => {
  let store: GraphStore | null = null;

  afterEach(() => {
    if (store) {
      store.close();
      store = null;
    }
  });

  it('computes influence scores and lineage metrics from citation graph', () => {
    store = createStore();
    const now = Date.now();
    store.recordArtifact({
      id: '1',
      author: '0xaaa',
      kind: 'essay',
      cid: 'cid-1',
      parentId: null,
      blockNumber: 1,
      blockHash: '0x1',
      logIndex: 0,
      timestamp: now
    });
    store.recordArtifact({
      id: '2',
      author: '0xbbb',
      kind: 'essay',
      cid: 'cid-2',
      parentId: '1',
      blockNumber: 2,
      blockHash: '0x2',
      logIndex: 0,
      timestamp: now + 1
    });
    store.recordArtifact({
      id: '3',
      author: '0xccc',
      kind: 'video',
      cid: 'cid-3',
      parentId: '1',
      blockNumber: 3,
      blockHash: '0x3',
      logIndex: 0,
      timestamp: now + 2
    });

    store.recordCitation({ fromId: '2', toId: '1', blockNumber: 4, blockHash: '0x4', logIndex: 0 });
    store.recordCitation({ fromId: '3', toId: '1', blockNumber: 5, blockHash: '0x5', logIndex: 0 });
    store.recordCitation({ fromId: '3', toId: '2', blockNumber: 5, blockHash: '0x5', logIndex: 1 });

    store.recomputeInfluence({ dampingFactor: 0.85, iterations: 20 });

    const artifacts = store.listArtifacts({ limit: 10 });
    const artifact1 = artifacts.find((a) => a.id === '1');
    const artifact2 = artifacts.find((a) => a.id === '2');
    const artifact3 = artifacts.find((a) => a.id === '3');

    expect(artifact1?.citationCount).toBe(2);
    expect(artifact2?.citationCount).toBe(1);
    expect(artifact3?.citationCount).toBe(0);

    expect(artifact1?.influenceScore ?? 0).toBeGreaterThan(artifact2?.influenceScore ?? 0);
    expect(artifact2?.influenceScore ?? 0).toBeGreaterThan(artifact3?.influenceScore ?? 0);

    const lineage = store.getLineage('2');
    expect(lineage).not.toBeNull();
    expect(lineage?.depth).toBe(1);
    expect(lineage?.artifacts[0].id).toBe('2');
    expect(lineage?.artifacts[1].id).toBe('1');
  });

  it('tracks arena usage statistics', () => {
    store = createStore();
    const now = Date.now();
    store.recordArtifact({
      id: '1',
      author: '0xabc',
      kind: 'game',
      cid: 'cid-1',
      parentId: null,
      blockNumber: 10,
      blockHash: '0x10',
      logIndex: 0,
      timestamp: now
    });
    store.recordArenaMatch({
      matchId: '0xmatch1',
      artifactId: '1',
      opponentId: '0xopponent1',
      result: 'WIN',
      blockNumber: 11,
      blockHash: '0x11',
      logIndex: 0
    });
    store.recordArenaMatch({
      matchId: '0xmatch2',
      artifactId: '1',
      opponentId: '0xopponent2',
      result: 'LOSS',
      blockNumber: 12,
      blockHash: '0x12',
      logIndex: 0
    });

    const stats = store.getArenaUsage();
    expect(stats.totalMatches).toBe(2);
    expect(stats.uniqueArtifacts).toBe(1);
    expect(stats.winCounts[0]).toEqual({ artifactId: '1', wins: 1, losses: 1, draws: 0 });
  });

  it('rolls back state on reorg and replays canonical events', () => {
    store = createStore();
    const now = Date.now();
    store.recordArtifact({
      id: '1',
      author: '0xroot',
      kind: 'essay',
      cid: 'cid-root',
      parentId: null,
      blockNumber: 50,
      blockHash: '0x50',
      logIndex: 0,
      timestamp: now
    });
    store.recordArtifact({
      id: '2',
      author: '0xchild',
      kind: 'essay',
      cid: 'cid-child',
      parentId: '1',
      blockNumber: 51,
      blockHash: '0x51',
      logIndex: 0,
      timestamp: now + 1
    });
    store.recordCitation({ fromId: '2', toId: '1', blockNumber: 51, blockHash: '0x51', logIndex: 1 });

    expect(store.getIncomingCitations('1')).toHaveLength(1);

    // Reorg at block 51 with different block hash removes previous citation
    store.recordArtifact({
      id: '2',
      author: '0xchild',
      kind: 'essay',
      cid: 'cid-child',
      parentId: '1',
      blockNumber: 51,
      blockHash: '0x99',
      logIndex: 0,
      timestamp: now + 2
    });

    expect(store.getArtifact('2')).not.toBeNull();
    expect(store.getIncomingCitations('1')).toHaveLength(0);
  });
});
