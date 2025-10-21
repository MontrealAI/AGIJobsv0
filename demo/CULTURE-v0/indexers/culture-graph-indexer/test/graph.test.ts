import { describe, expect, it } from 'vitest';
import { GraphStore } from '../src/graph.js';

describe('GraphStore', () => {
  it('computes influence with citations', () => {
    const store = new GraphStore();
    store.upsertArtifact({ id: 1, author: '0x1', kind: 'book', cid: 'cid1', timestamp: Date.now() });
    store.upsertArtifact({ id: 2, author: '0x2', kind: 'book', cid: 'cid2', timestamp: Date.now() });
    store.upsertArtifact({ id: 3, author: '0x3', kind: 'book', cid: 'cid3', timestamp: Date.now() });

    store.addCitation(2, 1);
    store.addCitation(3, 1);
    store.addCitation(3, 2);

    store.recomputeInfluence();

    const [a, b, c] = store.listArtifacts();
    expect(a.influence).toBeGreaterThan(b.influence);
    expect(b.influence).toBeGreaterThan(c.influence);
  });

  it('returns lineage chain', () => {
    const store = new GraphStore();
    store.upsertArtifact({ id: 1, author: '0x1', kind: 'book', cid: 'cid1', timestamp: Date.now() });
    store.upsertArtifact({ id: 2, author: '0x2', kind: 'book', cid: 'cid2', parentId: 1, timestamp: Date.now() });
    store.upsertArtifact({ id: 3, author: '0x3', kind: 'book', cid: 'cid3', parentId: 2, timestamp: Date.now() });

    store.recomputeInfluence();

    const lineage = store.getLineage(3);
    expect(lineage.length).toBe(2);
    expect(lineage[0].id).toBe(2);
    expect(lineage[1].id).toBe(1);
  });
});
