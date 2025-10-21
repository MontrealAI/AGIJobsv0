import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

export interface ArtifactMint {
  readonly id: string;
  readonly author: string;
  readonly kind: string;
  readonly cid: string;
  readonly parentId?: string | null;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly logIndex: number;
  readonly timestamp: number;
}

export interface ArtifactCitation {
  readonly fromId: string;
  readonly toId: string;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly logIndex: number;
}

export interface ArenaMatch {
  readonly matchId: string;
  readonly artifactId: string;
  readonly opponentId: string;
  readonly result: 'WIN' | 'LOSS' | 'DRAW';
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly logIndex: number;
}

export interface InfluenceConfig {
  readonly dampingFactor?: number;
  readonly iterations?: number;
}

export interface ArtifactRecord {
  readonly id: string;
  readonly author: string;
  readonly kind: string;
  readonly cid: string;
  readonly parentId: string | null;
  readonly createdAt: number;
  readonly influenceScore: number;
  readonly citationCount: number;
  readonly lineageDepth: number;
}

export interface CitationRecord {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
}

export interface LineagePath {
  readonly depth: number;
  readonly artifacts: readonly ArtifactRecord[];
}

export interface ArenaUsageStats {
  readonly totalMatches: number;
  readonly uniqueArtifacts: number;
  readonly winCounts: readonly ArenaWinCount[];
}

export interface ArenaWinCount {
  readonly artifactId: string;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
}

export interface Checkpoint {
  readonly blockNumber: number;
  readonly logIndex: number;
}

export class GraphStore {
  private readonly db: Database.Database;
  private readonly selectBlockStmt: Statement;
  private readonly insertBlockStmt: Statement;
  private readonly deleteBlocksFromStmt: Statement;

  private readonly insertArtifactStmt: Statement;
  private readonly deleteArtifactsFromBlockStmt: Statement;
  private readonly selectArtifactStmt: Statement;
  private readonly selectArtifactsStmt: Statement;
  private readonly selectArtifactsByKindStmt: Statement;
  private readonly insertCitationStmt: Statement;
  private readonly deleteCitationsFromBlockStmt: Statement;
  private readonly selectOutgoingCitationsStmt: Statement;
  private readonly selectIncomingCitationsStmt: Statement;

  private readonly insertMatchStmt: Statement;
  private readonly deleteMatchesFromBlockStmt: Statement;

  private readonly deleteInfluenceStmt: Statement;
  private readonly upsertInfluenceStmt: Statement;
  private readonly selectInfluenceStmt: Statement;
  private readonly selectTopInfluenceStmt: Statement;

  private readonly selectLineageStmt: Statement;
  private readonly selectCitationCountStmt: Statement;
  private readonly selectAllArtifactsStmt: Statement;
  private readonly selectAllCitationsStmt: Statement;

  private readonly selectCheckpointStmt: Statement;
  private readonly upsertCheckpointStmt: Statement;
  private readonly resetCheckpointStmt: Statement;

  private readonly totalMatchesStmt: Statement;
  private readonly uniqueArtifactsStmt: Statement;
  private readonly matchWinCountsStmt: Statement;

  constructor(databasePath = process.env.SQLITE_PATH ?? resolve('data/culture-graph.db')) {
    const resolved = databasePath === ':memory:' ? ':memory:' : resolve(databasePath);
    if (resolved !== ':memory:') {
      mkdirSync(dirname(resolved), { recursive: true });
    }
    this.db = new Database(resolved);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialiseSchema();

    this.selectBlockStmt = this.db.prepare('SELECT block_hash FROM block_state WHERE block_number = ?');
    this.insertBlockStmt = this.db.prepare('INSERT OR REPLACE INTO block_state (block_number, block_hash) VALUES (?, ?)');
    this.deleteBlocksFromStmt = this.db.prepare('DELETE FROM block_state WHERE block_number >= ?');

    this.insertArtifactStmt = this.db.prepare(
      'INSERT INTO artifacts (id, author, kind, cid, parent_id, created_at, created_block, created_log_index) ' +
        'VALUES (@id, @author, @kind, @cid, @parentId, @createdAt, @blockNumber, @logIndex) ' +
        'ON CONFLICT(id) DO UPDATE SET author = excluded.author, kind = excluded.kind, cid = excluded.cid, parent_id = excluded.parent_id, created_at = excluded.created_at, created_block = excluded.created_block, created_log_index = excluded.created_log_index'
    );
    this.deleteArtifactsFromBlockStmt = this.db.prepare('DELETE FROM artifacts WHERE created_block >= ?');
    this.selectArtifactStmt = this.db.prepare(
      'SELECT a.id, a.author, a.kind, a.cid, a.parent_id as parentId, a.created_at as createdAt, ' +
        'COALESCE(i.score, 0) as influenceScore, COALESCE(i.citation_count, 0) as citationCount, COALESCE(i.lineage_depth, 0) as lineageDepth ' +
        'FROM artifacts a LEFT JOIN influence_scores i ON i.artifact_id = a.id WHERE a.id = ?'
    );
    this.selectArtifactsStmt = this.db.prepare(
      'SELECT a.id, a.author, a.kind, a.cid, a.parent_id as parentId, a.created_at as createdAt, ' +
        'COALESCE(i.score, 0) as influenceScore, COALESCE(i.citation_count, 0) as citationCount, COALESCE(i.lineage_depth, 0) as lineageDepth ' +
        'FROM artifacts a LEFT JOIN influence_scores i ON i.artifact_id = a.id ' +
        'ORDER BY a.created_at DESC LIMIT ? OFFSET ?'
    );
    this.selectArtifactsByKindStmt = this.db.prepare(
      'SELECT a.id, a.author, a.kind, a.cid, a.parent_id as parentId, a.created_at as createdAt, ' +
        'COALESCE(i.score, 0) as influenceScore, COALESCE(i.citation_count, 0) as citationCount, COALESCE(i.lineage_depth, 0) as lineageDepth ' +
        'FROM artifacts a LEFT JOIN influence_scores i ON i.artifact_id = a.id WHERE a.kind = ? ' +
        'ORDER BY a.created_at DESC LIMIT ? OFFSET ?'
    );
    this.insertCitationStmt = this.db.prepare(
      'INSERT OR IGNORE INTO citations (from_id, to_id, created_block, created_log_index) VALUES (?, ?, ?, ?)'
    );
    this.deleteCitationsFromBlockStmt = this.db.prepare('DELETE FROM citations WHERE created_block >= ?');
    this.selectOutgoingCitationsStmt = this.db.prepare('SELECT id, from_id as fromId, to_id as toId FROM citations WHERE from_id = ? ORDER BY created_block, created_log_index');
    this.selectIncomingCitationsStmt = this.db.prepare('SELECT id, from_id as fromId, to_id as toId FROM citations WHERE to_id = ? ORDER BY created_block, created_log_index');

    this.insertMatchStmt = this.db.prepare(
      'INSERT OR REPLACE INTO arena_matches (match_id, artifact_id, opponent_id, result, created_block, created_log_index) VALUES (?, ?, ?, ?, ?, ?)'
    );
    this.deleteMatchesFromBlockStmt = this.db.prepare('DELETE FROM arena_matches WHERE created_block >= ?');

    this.deleteInfluenceStmt = this.db.prepare('DELETE FROM influence_scores');
    this.upsertInfluenceStmt = this.db.prepare(
      'INSERT OR REPLACE INTO influence_scores (artifact_id, score, citation_count, lineage_depth) VALUES (?, ?, ?, ?)'
    );
    this.selectInfluenceStmt = this.db.prepare(
      'SELECT a.id, a.author, a.kind, a.cid, a.parent_id as parentId, a.created_at as createdAt, ' +
        'COALESCE(i.score, 0) as influenceScore, COALESCE(i.citation_count, 0) as citationCount, COALESCE(i.lineage_depth, 0) as lineageDepth ' +
        'FROM artifacts a LEFT JOIN influence_scores i ON i.artifact_id = a.id WHERE a.id = ?'
    );
    this.selectTopInfluenceStmt = this.db.prepare(
      'SELECT a.id, a.author, a.kind, a.cid, a.parent_id as parentId, a.created_at as createdAt, ' +
        'COALESCE(i.score, 0) as influenceScore, COALESCE(i.citation_count, 0) as citationCount, COALESCE(i.lineage_depth, 0) as lineageDepth ' +
        'FROM artifacts a LEFT JOIN influence_scores i ON i.artifact_id = a.id ' +
        'ORDER BY influenceScore DESC, citationCount DESC LIMIT ?'
    );

    this.selectLineageStmt = this.db.prepare('SELECT id, author, kind, cid, parent_id as parentId, created_at as createdAt FROM artifacts WHERE id = ?');
    this.selectCitationCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM citations WHERE to_id = ?');
    this.selectAllArtifactsStmt = this.db.prepare('SELECT id, parent_id as parentId, created_at as createdAt FROM artifacts');
    this.selectAllCitationsStmt = this.db.prepare('SELECT from_id as fromId, to_id as toId FROM citations');

    this.selectCheckpointStmt = this.db.prepare('SELECT block_number as blockNumber, log_index as logIndex FROM checkpoints WHERE contract = ?');
    this.upsertCheckpointStmt = this.db.prepare('INSERT OR REPLACE INTO checkpoints (contract, block_number, log_index) VALUES (?, ?, ?)');
    this.resetCheckpointStmt = this.db.prepare('UPDATE checkpoints SET block_number = ?, log_index = 0 WHERE block_number >= ?');

    this.totalMatchesStmt = this.db.prepare('SELECT COUNT(*) as total FROM arena_matches');
    this.uniqueArtifactsStmt = this.db.prepare('SELECT COUNT(DISTINCT artifact_id) as total FROM arena_matches');
    this.matchWinCountsStmt = this.db.prepare(
      'SELECT artifact_id as artifactId, ' +
        "SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins, " +
        "SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses, " +
        "SUM(CASE WHEN result = 'DRAW' THEN 1 ELSE 0 END) as draws " +
        'FROM arena_matches GROUP BY artifact_id ORDER BY wins DESC, losses ASC'
    );
  }

  close(): void {
    this.db.close();
  }

  getCheckpoint(contract: string): Checkpoint | null {
    const row = this.selectCheckpointStmt.get(contract) as Checkpoint | undefined;
    return row ?? null;
  }

  updateCheckpoint(contract: string, blockNumber: number, logIndex: number): void {
    this.upsertCheckpointStmt.run(contract, blockNumber, logIndex);
  }

  recordArtifact(event: ArtifactMint): void {
    this.withTransaction(() => {
      this.ensureCanonical(event.blockNumber, event.blockHash);
      this.insertArtifactStmt.run({
        id: event.id,
        author: event.author.toLowerCase(),
        kind: event.kind,
        cid: event.cid,
        parentId: event.parentId ?? null,
        createdAt: event.timestamp,
        blockNumber: event.blockNumber,
        logIndex: event.logIndex
      });
    });
  }

  recordCitation(event: ArtifactCitation): void {
    this.withTransaction(() => {
      this.ensureCanonical(event.blockNumber, event.blockHash);
      this.insertCitationStmt.run(event.fromId, event.toId, event.blockNumber, event.logIndex);
    });
  }

  recordArenaMatch(event: ArenaMatch): void {
    this.withTransaction(() => {
      this.ensureCanonical(event.blockNumber, event.blockHash);
      this.insertMatchStmt.run(event.matchId, event.artifactId, event.opponentId, event.result, event.blockNumber, event.logIndex);
    });
  }

  getArtifact(id: string): ArtifactRecord | null {
    const row = this.selectArtifactStmt.get(id) as ArtifactRecord | undefined;
    return row ?? null;
  }

  listArtifacts(params: { limit?: number; offset?: number; kind?: string } = {}): ArtifactRecord[] {
    const limit = params.limit ?? 25;
    const offset = params.offset ?? 0;
    if (params.kind) {
      return this.selectArtifactsByKindStmt.all(params.kind, limit, offset) as ArtifactRecord[];
    }
    return this.selectArtifactsStmt.all(limit, offset) as ArtifactRecord[];
  }

  getTopInfluencers(limit = 10): ArtifactRecord[] {
    return this.selectTopInfluenceStmt.all(limit) as ArtifactRecord[];
  }

  getOutgoingCitations(id: string): CitationRecord[] {
    return this.selectOutgoingCitationsStmt.all(id) as CitationRecord[];
  }

  getIncomingCitations(id: string): CitationRecord[] {
    return this.selectIncomingCitationsStmt.all(id) as CitationRecord[];
  }

  getLineage(id: string): LineagePath | null {
    const artifacts: ArtifactRecord[] = [];
    let currentId: string | null = id;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);
      const row = this.selectLineageStmt.get(currentId) as
        | { id: string; author: string; kind: string; cid: string; parentId: string | null; createdAt: number }
        | undefined;
      if (!row) break;
      const influence = this.selectInfluenceStmt.get(currentId) as ArtifactRecord | undefined;
      artifacts.push({
        id: row.id,
        author: row.author,
        kind: row.kind,
        cid: row.cid,
        parentId: row.parentId,
        createdAt: row.createdAt,
        influenceScore: influence?.influenceScore ?? 0,
        citationCount: influence?.citationCount ?? this.getCitationCount(row.id),
        lineageDepth: influence?.lineageDepth ?? 0
      });
      currentId = row.parentId ?? null;
    }

    if (artifacts.length === 0) {
      return null;
    }

    return { depth: artifacts.length - 1, artifacts };
  }

  getCitationCount(id: string): number {
    const row = this.selectCitationCountStmt.get(id) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  getCitations(params: { fromId?: string; toId?: string } = {}): CitationRecord[] {
    if (params.fromId) {
      return this.selectOutgoingCitationsStmt.all(params.fromId) as CitationRecord[];
    }
    if (params.toId) {
      return this.selectIncomingCitationsStmt.all(params.toId) as CitationRecord[];
    }
    return this.db.prepare('SELECT id, from_id as fromId, to_id as toId FROM citations').all() as CitationRecord[];
  }

  getArenaUsage(): ArenaUsageStats {
    const totalMatches = (this.totalMatchesStmt.get() as { total: number }).total;
    const uniqueArtifacts = (this.uniqueArtifactsStmt.get() as { total: number }).total;
    const winCounts = this.matchWinCountsStmt.all() as ArenaWinCount[];
    return { totalMatches, uniqueArtifacts, winCounts };
  }

  recomputeInfluence(config: InfluenceConfig = {}): void {
    const damping = config.dampingFactor ?? Number(process.env.INFLUENCE_DAMPING ?? 0.85);
    const iterations = config.iterations ?? Number(process.env.INFLUENCE_ITERATIONS ?? 25);

    const artifacts = this.selectAllArtifactsStmt.all() as Array<{ id: string; parentId: string | null; createdAt: number }>;
    const citations = this.selectAllCitationsStmt.all() as Array<{ fromId: string; toId: string }>;

    if (artifacts.length === 0) {
      this.deleteInfluenceStmt.run();
      return;
    }

    const nodes = new Map<string, { cites: Set<string>; incoming: Set<string>; parentId: string | null; createdAt: number }>();
    for (const artifact of artifacts) {
      nodes.set(artifact.id, {
        cites: new Set<string>(),
        incoming: new Set<string>(),
        parentId: artifact.parentId,
        createdAt: artifact.createdAt
      });
    }

    for (const citation of citations) {
      const source = nodes.get(citation.fromId);
      const target = nodes.get(citation.toId);
      if (!source || !target) continue;
      source.cites.add(citation.toId);
      target.incoming.add(citation.fromId);
    }

    const ids = Array.from(nodes.keys());
    const N = ids.length;
    const baseScore = 1 / N;
    const scores = new Map<string, number>();
    const tempScores = new Map<string, number>();

    for (const id of ids) {
      scores.set(id, baseScore);
    }

    for (let i = 0; i < iterations; i++) {
      let danglingSum = 0;
      for (const id of ids) {
        const node = nodes.get(id)!;
        if (node.cites.size === 0) {
          danglingSum += scores.get(id)!;
        }
      }
      for (const id of ids) {
        const node = nodes.get(id)!;
        let rank = (1 - damping) / N;
        rank += (damping * danglingSum) / N;
        for (const incoming of node.incoming) {
          const incomingNode = nodes.get(incoming);
          if (!incomingNode) continue;
          const outDegree = incomingNode.cites.size;
          if (outDegree === 0) continue;
          rank += (damping * scores.get(incoming)!) / outDegree;
        }
        tempScores.set(id, rank);
      }
      for (const id of ids) {
        scores.set(id, tempScores.get(id)!);
      }
    }

    const depthCache = new Map<string, number>();
    const citationCountCache = new Map<string, number>();

    const computeDepth = (id: string, visited: Set<string>): number => {
      if (depthCache.has(id)) return depthCache.get(id)!;
      if (visited.has(id)) return 0;
      visited.add(id);
      const node = nodes.get(id);
      if (!node || !node.parentId || !nodes.has(node.parentId)) {
        depthCache.set(id, 0);
        return 0;
      }
      const depth = 1 + computeDepth(node.parentId, visited);
      depthCache.set(id, depth);
      return depth;
    };

    const citationCounts = this.db.prepare('SELECT to_id as id, COUNT(*) as cnt FROM citations GROUP BY to_id').all() as Array<{ id: string; cnt: number }>;
    for (const row of citationCounts) {
      citationCountCache.set(row.id, row.cnt);
    }

    this.withTransaction(() => {
      this.deleteInfluenceStmt.run();
      for (const id of ids) {
        const score = scores.get(id) ?? 0;
        const depth = computeDepth(id, new Set<string>());
        const citationCount = citationCountCache.get(id) ?? 0;
        this.upsertInfluenceStmt.run(id, score, citationCount, depth);
      }
    });
  }

  private withTransaction(fn: () => void): void {
    this.db.transaction(fn)();
  }

  private ensureCanonical(blockNumber: number, blockHash: string): void {
    const row = this.selectBlockStmt.get(blockNumber) as { block_hash: string } | undefined;
    if (!row) {
      this.insertBlockStmt.run(blockNumber, blockHash);
      return;
    }
    if (row.block_hash === blockHash) {
      return;
    }
    this.rollbackFromBlock(blockNumber);
    this.insertBlockStmt.run(blockNumber, blockHash);
  }

  private rollbackFromBlock(blockNumber: number): void {
    this.deleteBlocksFromStmt.run(blockNumber);
    this.deleteCitationsFromBlockStmt.run(blockNumber);
    this.deleteArtifactsFromBlockStmt.run(blockNumber);
    this.deleteMatchesFromBlockStmt.run(blockNumber);
    this.deleteInfluenceStmt.run();
    this.resetCheckpointStmt.run(blockNumber - 1, blockNumber);
  }

  private initialiseSchema(): void {
    const createStatements = [
      'CREATE TABLE IF NOT EXISTS artifacts (\n        id TEXT PRIMARY KEY,\n        author TEXT NOT NULL,\n        kind TEXT NOT NULL,\n        cid TEXT NOT NULL,\n        parent_id TEXT,\n        created_at INTEGER NOT NULL,\n        created_block INTEGER NOT NULL,\n        created_log_index INTEGER NOT NULL\n      )',
      'CREATE TABLE IF NOT EXISTS citations (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        from_id TEXT NOT NULL,\n        to_id TEXT NOT NULL,\n        created_block INTEGER NOT NULL,\n        created_log_index INTEGER NOT NULL,\n        UNIQUE(from_id, to_id, created_block, created_log_index)\n      )',
      'CREATE TABLE IF NOT EXISTS arena_matches (\n        match_id TEXT PRIMARY KEY,\n        artifact_id TEXT NOT NULL,\n        opponent_id TEXT NOT NULL,\n        result TEXT NOT NULL,\n        created_block INTEGER NOT NULL,\n        created_log_index INTEGER NOT NULL\n      )',
      'CREATE TABLE IF NOT EXISTS influence_scores (\n        artifact_id TEXT PRIMARY KEY,\n        score REAL NOT NULL,\n        citation_count INTEGER NOT NULL,\n        lineage_depth INTEGER NOT NULL\n      )',
      'CREATE TABLE IF NOT EXISTS block_state (\n        block_number INTEGER PRIMARY KEY,\n        block_hash TEXT NOT NULL\n      )',
      'CREATE TABLE IF NOT EXISTS checkpoints (\n        contract TEXT PRIMARY KEY,\n        block_number INTEGER NOT NULL,\n        log_index INTEGER NOT NULL\n      )'
    ];

    this.db.exec(createStatements.join(';'));
  }
}
