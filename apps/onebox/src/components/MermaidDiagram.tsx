'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type MermaidDiagramProps = {
  definition: string;
  chartId: string;
  className?: string;
  ariaLabel: string;
};

let mermaidModule: typeof import('mermaid') | null = null;
let mermaidInitialised = false;

const loadMermaid = async () => {
  if (!mermaidModule) {
    mermaidModule = await import('mermaid');
  }
  if (!mermaidInitialised) {
    mermaidModule.default.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'strict',
    });
    mermaidInitialised = true;
  }
  return mermaidModule.default;
};

export function MermaidDiagram({
  definition,
  chartId,
  className,
  ariaLabel,
}: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const diagramDefinition = useMemo(() => definition.trim(), [definition]);

  useEffect(() => {
    let isCancelled = false;
    const renderDiagram = async () => {
      try {
        const mermaid = await loadMermaid();
        if (isCancelled) {
          return;
        }
        const renderId = `${chartId}-${crypto.randomUUID()}`;
        const { svg } = await mermaid.render(renderId, diagramDefinition);
        if (!isCancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (renderError) {
        if (!isCancelled) {
          const message =
            renderError instanceof Error
              ? renderError.message
              : 'Failed to render diagram.';
          setError(message);
        }
      }
    };

    void renderDiagram();

    return () => {
      isCancelled = true;
    };
  }, [chartId, diagramDefinition]);

  if (error) {
    return (
      <pre className={className} role="alert">
        {`Diagram error: ${error}`}
      </pre>
    );
  }

  return <div ref={containerRef} className={className} role="img" aria-label={ariaLabel} />;
}
