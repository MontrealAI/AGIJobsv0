'use client';

import { useEffect, useId, useState } from 'react';

let mermaidInitialised = false;

interface MermaidDiagramProps {
  definition: string;
  caption?: string;
  className?: string;
}

export default function MermaidDiagram({ definition, caption, className }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const rawId = useId();
  const elementId = `agi-governance-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    let cancelled = false;

    async function renderMermaid() {
      try {
        const mermaid = await import('mermaid');
        if (!mermaidInitialised) {
          mermaid.default.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'dark',
            themeVariables: {
              primaryColor: '#11162a',
              primaryTextColor: '#f2f4f7',
              secondaryColor: '#1d2340',
              tertiaryColor: '#232b4d',
              lineColor: '#7a3bff',
              fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            },
          });
          mermaidInitialised = true;
        }
        const { svg } = await mermaid.default.render(`${elementId}-diagram`, definition.trim());
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to render Mermaid diagram.';
          setError(message);
          setSvg('');
        }
      }
    }

    renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [definition, elementId]);

  return (
    <div className={className}>
      {caption ? <div className="mermaid-caption">{caption}</div> : null}
      {error ? (
        <pre className="mermaid-error">{error}</pre>
      ) : (
        <div className="mermaid-wrapper" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );
}
