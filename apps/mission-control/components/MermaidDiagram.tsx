'use client';

import { Box, Spinner, Text } from '@chakra-ui/react';
import mermaid from 'mermaid';
import { useEffect, useId, useState } from 'react';

let mermaidConfigured = false;

export interface MermaidDiagramProps {
  chart: string;
  caption?: string;
}

export function MermaidDiagram({ chart, caption }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const reactId = useId();

  useEffect(() => {
    if (!mermaidConfigured) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: 'Inter, ui-sans-serif, system-ui'
      });
      mermaidConfigured = true;
    }
  }, []);

  useEffect(() => {
    let canceled = false;

    const renderDiagram = async () => {
      try {
        const sanitizedId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        const { svg } = await mermaid.render(sanitizedId, chart);
        if (!canceled) {
          setSvg(svg);
        }
      } catch (err) {
        if (!canceled) {
          setError((err as Error).message);
        }
      }
    };

    setSvg('');
    setError(null);
    renderDiagram();

    return () => {
      canceled = true;
    };
  }, [chart, reactId]);

  return (
    <Box
      className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-4 shadow-inner"
      overflow="auto"
      position="relative"
    >
      {!svg && !error ? (
        <Box display="flex" justifyContent="center" alignItems="center" minH="120px">
          <Spinner color="purple.300" />
        </Box>
      ) : null}
      {error ? (
        <Text color="red.300" fontSize="sm">
          Failed to render diagram: {error}
        </Text>
      ) : null}
      {svg ? <Box dangerouslySetInnerHTML={{ __html: svg }} /> : null}
      {caption ? (
        <Text mt={3} color="gray.400" fontSize="sm">
          {caption}
        </Text>
      ) : null}
    </Box>
  );
}
