'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Box, Button, Card, CardBody, CardHeader, Heading, Stack, Text } from '@chakra-ui/react';
import toast from 'react-hot-toast';

const ForceGraph2D = dynamic(() => import('react-force-graph').then((mod) => mod.ForceGraph2D), { ssr: false });

type GraphNode = {
  id: string;
  name: string;
  influence: number;
  actionable?: boolean;
  x?: number;
  y?: number;
};

type GraphLink = {
  source: string;
  target: string;
  label: string;
};

const nodes: GraphNode[] = [
  { id: 'artifact-orion', name: 'Orion Validator Primer', influence: 0.7 },
  { id: 'artifact-zenith', name: 'Zenith Playbook', influence: 0.85, actionable: true },
  { id: 'artifact-nebula', name: 'Nebula Recovery Codex', influence: 0.92, actionable: true },
  { id: 'artifact-halo', name: 'Halo Validator Guide', influence: 0.5 },
  { id: 'artifact-aurora', name: 'Aurora Auditor Companion', influence: 0.63 }
];

const links: GraphLink[] = [
  { source: 'artifact-zenith', target: 'artifact-orion', label: 'derived insights' },
  { source: 'artifact-nebula', target: 'artifact-zenith', label: 'playbook uplift' },
  { source: 'artifact-orion', target: 'artifact-halo', label: 'validator primers' },
  { source: 'artifact-halo', target: 'artifact-aurora', label: 'audit escalation' }
];

export function ArtifactGraph() {
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const data = useMemo<{ nodes: GraphNode[]; links: GraphLink[] }>(
    () => ({ nodes, links }),
    []
  );

  const handleAction = () => {
    if (!selected) return;
    toast.success(`Derivative job seeded from ${selected.name}`);
  };

  return (
    <Stack spacing={6}>
      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardHeader>
          <Heading size="md" color="indigo.200">
            Artifact Influence Graph
          </Heading>
        </CardHeader>
        <CardBody>
          <Box height={{ base: '320px', md: '520px' }}>
            <ForceGraph2D
              graphData={data}
              nodeLabel={(node: GraphNode) => {
                return `${node.name} — influence ${(node.influence * 100).toFixed(0)}%`;
              }}
              nodeCanvasObject={(node: GraphNode, ctx, globalScale) => {
                const label = node.name;
                const fontSize = 12 / globalScale;
                const radius = 6 + node.influence * 10;
                ctx.beginPath();
                ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI, false);
                ctx.fillStyle = node.actionable ? '#34d399' : '#6366f1';
                ctx.fill();
                ctx.font = `${fontSize}px Sans-Serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = '#e2e8f0';
                ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + radius);
              }}
              linkLabel={(link: GraphLink) => link.label}
              onNodeClick={(node: GraphNode) => setSelected(node)}
            />
          </Box>
        </CardBody>
      </Card>

      {selected && (
        <Card className="border border-indigo-500/40 bg-slate-900/70">
          <CardHeader>
            <Heading size="sm" color="indigo.200">
              {selected.name}
            </Heading>
          </CardHeader>
          <CardBody>
            <Text color="gray.300">
              Influence percentile {(selected.influence * 100).toFixed(1)}%. {selected.actionable ? 'Actionable node ready for derivative job creation.' : 'Review upstream artifacts before deriving.'}
            </Text>
            {selected.actionable && (
              <Button colorScheme="green" mt={4} onClick={handleAction}>
                Create derivative job
              </Button>
            )}
          </CardBody>
        </Card>
      )}
    </Stack>
  );
}
