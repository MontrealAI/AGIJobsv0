import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import { createDerivativeJob, fetchArtifacts, type Artifact, type DerivativeJobResult } from '../lib/api.js';

interface GraphNode extends NodeObject {
  id: number;
  name: string;
  influence: number;
  kind: string;
  mintedAt?: string;
  x?: number;
  y?: number;
}

interface GraphLink extends LinkObject {
  source: number;
  target: number;
  linkType: 'derivation' | 'citation';
}

export function ArtifactGraph() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [focused, setFocused] = useState<GraphNode | null>(null);
  const [jobStatus, setJobStatus] = useState<{ artifactId: number; result: DerivativeJobResult } | null>(null);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graphRef = useRef<ForceGraphMethods>();

  useEffect(() => {
    let mounted = true;
    fetchArtifacts()
      .then((items) => {
        if (!mounted) return;
        setArtifacts(items);
        if (items.length > 0) {
          const [first] = items;
          setFocused({
            id: first.id,
            name: first.title,
            influence: first.influence,
            kind: first.kind,
            mintedAt: first.mintedAt
          });
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.title,
      influence: artifact.influence,
      kind: artifact.kind,
      mintedAt: artifact.mintedAt
    }));
    const links: GraphLink[] = [];

    for (const artifact of artifacts) {
      if (artifact.parentId) {
        links.push({ source: artifact.parentId, target: artifact.id, linkType: 'derivation' });
      }
      for (const cited of artifact.cites) {
        links.push({ source: artifact.id, target: cited, linkType: 'citation' });
      }
    }

    return { nodes, links };
  }, [artifacts]);

  useEffect(() => {
    if (focused && graphRef.current && typeof focused.x === 'number' && typeof focused.y === 'number') {
      graphRef.current.centerAt(focused.x, focused.y, 500);
      graphRef.current.zoom(3, 500);
    }
  }, [focused]);

  const handleCreateJob = async (node: GraphNode) => {
    setIsCreatingJob(true);
    setError(null);
    try {
      const result = await createDerivativeJob(node.id);
      setJobStatus({ artifactId: node.id, result });
    } catch (cause) {
      console.error(cause);
      setError('Could not schedule the derivative job. Please retry.');
    } finally {
      setIsCreatingJob(false);
    }
  };

  if (isLoading) {
    return <div className="card">Loading culture graph…</div>;
  }

  return (
    <section className="card">
      <h2>Culture graph</h2>
      <p className="subtitle">
        Explore how every minted artifact influences the next one. Hover to inspect, click to launch a derivative job for that
        branch.
      </p>
      <div className="graph-wrapper">
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={undefined}
          height={420}
          backgroundColor="rgba(15, 23, 42, 0)"
          nodeCanvasObject={(node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) =>
            drawNode(node as GraphNode, ctx, globalScale)
          }
          nodePointerAreaPaint={(node: NodeObject, color: string, ctx: CanvasRenderingContext2D) =>
            drawPointer(node as GraphNode, color, ctx)
          }
          linkColor={(link: LinkObject) => (link as GraphLink).linkType === 'derivation' ? '#38bdf8' : '#a855f7'}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.004}
          nodeLabel={(node: NodeObject) => formatTooltip(node as GraphNode)}
          onNodeClick={(node: NodeObject) => setFocused(node as GraphNode)}
          cooldownTicks={60}
        />
      </div>

      {focused && (
        <div className="graph-detail">
          <div>
            <h3>
              #{focused.id} — {focused.name}
            </h3>
            <p>
              Influence score <strong>{focused.influence.toFixed(3)}</strong>
            </p>
            <p>
              Kind: <span className="badge subtle">{focused.kind}</span>
            </p>
            {focused.mintedAt && <p>Minted {new Date(focused.mintedAt).toLocaleString()}</p>}
          </div>
          <div className="graph-actions">
            <button type="button" onClick={() => handleCreateJob(focused)} disabled={isCreatingJob}>
              {isCreatingJob ? 'Scheduling…' : 'Create derivative job'}
            </button>
            {jobStatus && jobStatus.artifactId === focused.id && (
              <p className="status-text">Job ready: {jobStatus.result.title}</p>
            )}
            {error && <p className="error-text">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function drawNode(node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) {
  if (typeof node.x !== 'number' || typeof node.y !== 'number') {
    return;
  }
  const baseRadius = 6;
  const influenceRadius = Math.min(28, baseRadius + Math.log1p(node.influence * 20));
  const label = node.name;
  ctx.beginPath();
  const gradient = ctx.createRadialGradient(
    node.x as number,
    node.y as number,
    influenceRadius * 0.25,
    node.x as number,
    node.y as number,
    influenceRadius
  );
  gradient.addColorStop(0, '#38bdf8');
  gradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = gradient;
  ctx.arc(node.x as number, node.y as number, influenceRadius, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.font = `${Math.max(10, 16 / globalScale)}px Inter, system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, node.x as number, (node.y as number) + influenceRadius + 12);
}

function drawPointer(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) {
  if (typeof node.x !== 'number' || typeof node.y !== 'number') {
    return;
  }
  ctx.fillStyle = color;
  const radius = Math.min(28, 6 + Math.log1p(node.influence * 20));
  ctx.beginPath();
  ctx.arc(node.x as number, node.y as number, radius, 0, 2 * Math.PI);
  ctx.fill();
}

function formatTooltip(node: GraphNode) {
  const minted = node.mintedAt ? `\nMinted: ${new Date(node.mintedAt).toLocaleString()}` : '';
  return `${node.name}\nInfluence: ${node.influence.toFixed(3)}\nKind: ${node.kind}${minted}`;
}
