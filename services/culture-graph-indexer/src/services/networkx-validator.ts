import { spawn } from 'node:child_process';

export interface InfluenceValidationGraph {
  readonly nodes: readonly string[];
  readonly edges: readonly [string, string][];
}

export interface InfluenceValidationConfig {
  readonly dampingFactor: number;
  readonly maxIterations: number;
  readonly tolerance: number;
}

export interface InfluenceValidator {
  validate(
    graph: InfluenceValidationGraph,
    scores: Map<string, number>,
    config: InfluenceValidationConfig
  ): Promise<InfluenceValidationReport>;
}

export interface InfluenceValidationReport {
  readonly ok: boolean;
  readonly skipped: boolean;
  readonly engine: string | null;
  readonly maxDelta: number;
  readonly externalScores: Map<string, number> | null;
  readonly error?: string;
}

interface PythonValidationResult {
  readonly scores: Record<string, number>;
  readonly engine: string;
}

const PYTHON_SNIPPET = `import json
import sys

try:
    import networkx as nx  # type: ignore
    USING_NETWORKX = True
except Exception:
    nx = None
    USING_NETWORKX = False


def fallback_pagerank(nodes, edges, damping, max_iterations, tolerance):
    total_nodes = len(nodes)
    if total_nodes == 0:
        return {}

    teleport = (1.0 - damping) / total_nodes
    scores = {node: 1.0 / total_nodes for node in nodes}
    outgoing = {node: 0 for node in nodes}
    inbound = {node: [] for node in nodes}

    for source, target in edges:
        outgoing.setdefault(source, 0)
        inbound.setdefault(target, [])
        outgoing[source] += 1
        inbound[target].append(source)

    for _ in range(max_iterations):
        difference = 0.0
        new_scores = {}
        dangling_sum = sum(scores[node] for node, count in outgoing.items() if count == 0)

        for node in nodes:
            rank = 0.0
            for source in inbound.get(node, []):
                count = outgoing.get(source, 0)
                if count:
                    rank += scores[source] / count
            rank += dangling_sum / total_nodes
            rank = teleport + damping * rank
            difference += abs(rank - scores[node])
            new_scores[node] = rank

        scores = new_scores
        if difference < tolerance:
            break

    return scores


def compute_pagerank(nodes, edges, damping, max_iterations, tolerance):
    if USING_NETWORKX and nx is not None:
        graph = nx.DiGraph()
        graph.add_nodes_from(nodes)
        graph.add_edges_from(edges)
        scores = nx.pagerank(graph, alpha=damping, max_iter=max_iterations, tol=tolerance)
        return scores, "networkx"

    scores = fallback_pagerank(nodes, edges, damping, max_iterations, tolerance)
    return scores, "fallback"


def main():
    payload = json.load(sys.stdin)
    nodes = payload.get("nodes", [])
    edges = payload.get("edges", [])
    damping = float(payload.get("dampingFactor", 0.85))
    max_iterations = int(payload.get("maxIterations", 25))
    tolerance = float(payload.get("tolerance", 1e-6))

    scores, engine = compute_pagerank(nodes, edges, damping, max_iterations, tolerance)
    json.dump({"scores": scores, "engine": engine}, sys.stdout)


if __name__ == "__main__":
    main()
`;

export interface NetworkXInfluenceValidatorOptions {
  readonly pythonCommand?: string;
  readonly toleranceMultiplier?: number;
}

export class NetworkXInfluenceValidator implements InfluenceValidator {
  private readonly pythonCommand: string;
  private readonly toleranceMultiplier: number;

  constructor(options: NetworkXInfluenceValidatorOptions = {}) {
    this.pythonCommand = options.pythonCommand ?? 'python3';
    this.toleranceMultiplier = options.toleranceMultiplier ?? 5;
  }

  async validate(
    graph: InfluenceValidationGraph,
    scores: Map<string, number>,
    config: InfluenceValidationConfig
  ): Promise<InfluenceValidationReport> {
    try {
      const result = await this.runPython(graph, config);
      const externalScores = new Map<string, number>();
      for (const [artifactId, value] of Object.entries(result.scores)) {
        externalScores.set(artifactId, Number(value));
      }

      let maxDelta = 0;
      for (const node of graph.nodes) {
        const internal = scores.get(node) ?? 0;
        const external = externalScores.get(node) ?? 0;
        const delta = Math.abs(internal - external);
        if (delta > maxDelta) {
          maxDelta = delta;
        }
      }

      const tolerance = config.tolerance * this.toleranceMultiplier;
      const ok = maxDelta <= tolerance;

      return {
        ok,
        skipped: false,
        engine: result.engine,
        maxDelta,
        externalScores,
        error: ok ? undefined : `Maximum delta ${maxDelta} exceeded tolerance ${tolerance}`,
      };
    } catch (error) {
      return {
        ok: false,
        skipped: true,
        engine: null,
        maxDelta: 0,
        externalScores: null,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  private runPython(
    graph: InfluenceValidationGraph,
    config: InfluenceValidationConfig
  ): Promise<PythonValidationResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonCommand, ['-c', PYTHON_SNIPPET], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });

      child.on('error', (processError) => {
        reject(processError);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`NetworkX validator exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const parsed = JSON.parse(stdout) as PythonValidationResult;
          resolve(parsed);
        } catch (parseError) {
          reject(
            new Error(
              `Failed to parse NetworkX validator output: ${stdout || '[empty]'}`
            )
          );
        }
      });

      const payload = JSON.stringify({
        nodes: [...graph.nodes],
        edges: graph.edges,
        dampingFactor: config.dampingFactor,
        maxIterations: config.maxIterations,
        tolerance: config.tolerance,
      });

      child.stdin.write(payload);
      child.stdin.end();
    });
  }
}

export class NoopInfluenceValidator implements InfluenceValidator {
  async validate(
    _graph: InfluenceValidationGraph,
    _scores: Map<string, number>,
    _config: InfluenceValidationConfig
  ): Promise<InfluenceValidationReport> {
    return {
      ok: true,
      skipped: true,
      engine: null,
      maxDelta: 0,
      externalScores: null,
    };
  }
}
