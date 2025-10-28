import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ReportSummary } from './types';

export function renderDashboard(
  reportDir: string,
  summary: ReportSummary
): void {
  const mermaidDiagram = `graph LR
  Earth((Earth Shard)):::earth -->|spillover ${summary.shards.earth.spilloversOut}| Mars((Mars Shard)):::mars
  Mars -->|spillover ${summary.shards.mars.spilloversOut}| Helios((Helios Shard)):::helios
  Luna((Luna Shard)):::luna --> Earth
  Edge((Edge Constellation)):::edge --> Helios
  Helios --> Earth
  classDef earth fill:#1e3a8a,stroke:#0ea5e9,color:#fff;
  classDef mars fill:#7f1d1d,stroke:#f97316,color:#fff;
  classDef luna fill:#334155,stroke:#cbd5f5,color:#fff;
  classDef helios fill:#b45309,stroke:#facc15,color:#fff;
  classDef edge fill:#064e3b,stroke:#34d399,color:#fff;
  `;

  const shardRows = Object.entries(summary.shards)
    .map(
      ([id, shard]) => `
      <tr>
        <td class="label">${id.toUpperCase()}</td>
        <td>${shard.queueDepth}</td>
        <td>${shard.jobsCompleted}</td>
        <td>${shard.spilloversOut}</td>
        <td>${shard.spilloversIn}</td>
        <td>${(shard.rerouteBudget * 100).toFixed(1)}%</td>
      </tr>`
    )
    .join('\n');

  const nodeRows = Object.entries(summary.nodes)
    .map(
      ([id, node]) => `
      <tr>
        <td class="label">${id}</td>
        <td>${node.status}</td>
        <td>${node.assignments}</td>
        <td>${node.totalCompleted}</td>
        <td>${node.downtimeTicks}</td>
        <td>${node.spilloversHandled}</td>
      </tr>`
    )
    .join('\n');

  const ownerRows = summary.ownerCommands.executed
    .map(
      (command) => `
      <tr>
        <td class="label">${command.command}</td>
        <td>${command.tick}</td>
        <td><code>${JSON.stringify(command.payload ?? {}, null, 2)}</code></td>
      </tr>`
    )
    .join('\n');

  const html = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Planetary Orchestrator Fabric Mission Console</title>
      <style>
        :root {
          color-scheme: dark;
          font-family: 'Inter', system-ui, sans-serif;
          background: radial-gradient(circle at top, #0f172a, #020617 60%);
          color: #f8fafc;
        }
        body {
          margin: 0;
          padding: 2.5rem;
        }
        h1 {
          font-size: 2.75rem;
          margin-bottom: 0.5rem;
          letter-spacing: 0.08em;
        }
        h2 {
          font-size: 1.5rem;
          margin-top: 2rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 1rem;
          overflow: hidden;
        }
        th, td {
          padding: 0.75rem 1rem;
          text-align: left;
        }
        th {
          background: rgba(51, 65, 85, 0.7);
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.3em;
        }
        tr:nth-child(even) {
          background: rgba(15, 23, 42, 0.5);
        }
        .metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1.5rem;
          margin: 2rem 0;
        }
        .metric-card {
          padding: 1.5rem;
          border-radius: 1.25rem;
          background: linear-gradient(145deg, rgba(59,130,246,0.25), rgba(37,99,235,0.05));
          border: 1px solid rgba(96, 165, 250, 0.2);
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.45);
        }
        .metric-card h3 {
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.25em;
          font-size: 0.8rem;
          color: rgba(148, 163, 184, 0.9);
        }
        .metric-card p {
          margin-top: 0.85rem;
          font-size: 2rem;
          font-weight: 700;
        }
        .label {
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.15em;
        }
        .mermaid {
          background: rgba(15, 23, 42, 0.6);
          border-radius: 1rem;
          padding: 1rem;
          margin-top: 1.5rem;
          border: 1px solid rgba(96, 165, 250, 0.2);
        }
        code {
          color: #22d3ee;
          white-space: pre-wrap;
        }
        footer {
          margin-top: 3rem;
          text-align: center;
          color: rgba(148, 163, 184, 0.8);
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
      <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
    </head>
    <body>
      <header>
        <h1>Planetary Orchestrator Fabric</h1>
        <p>Mission Metrics // ${summary.runLabel.toUpperCase()} // tick ${
    summary.metrics.tick
  }</p>
      </header>
      <section class="metrics">
        <div class="metric-card">
          <h3>Jobs Completed</h3>
          <p>${summary.metrics.jobsCompleted.toLocaleString()}</p>
        </div>
        <div class="metric-card">
          <h3>Drop Rate</h3>
          <p>${(summary.metrics.dropRate * 100).toFixed(2)}%</p>
        </div>
        <div class="metric-card">
          <h3>Mean Latency</h3>
          <p>${summary.metrics.averageLatency.toFixed(2)} ticks</p>
        </div>
        <div class="metric-card">
          <h3>Cross-Shard Spillovers</h3>
          <p>${summary.metrics.spillovers}</p>
        </div>
      </section>
      <section>
        <h2>Shard Orchestration Atlas</h2>
        <div class="mermaid">${mermaidDiagram}</div>
      </section>
      <section>
        <h2>Shard Posture Snapshot</h2>
        <table>
          <thead>
            <tr>
              <th>Shard</th>
              <th>Queue</th>
              <th>Completed</th>
              <th>Spillover Out</th>
              <th>Spillover In</th>
              <th>Reroute Budget</th>
            </tr>
          </thead>
          <tbody>
            ${shardRows}
          </tbody>
        </table>
      </section>
      <section>
        <h2>Node Marketplace Telemetry</h2>
        <table>
          <thead>
            <tr>
              <th>Node</th>
              <th>Status</th>
              <th>Active Assignments</th>
              <th>Completed</th>
              <th>Downtime</th>
              <th>Spillovers</th>
            </tr>
          </thead>
          <tbody>
            ${nodeRows}
          </tbody>
        </table>
      </section>
      <section>
        <h2>Owner Command Payloads</h2>
        <table>
          <thead>
            <tr>
              <th>Command</th>
              <th>Tick</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            ${ownerRows}
          </tbody>
        </table>
      </section>
      <footer>
        Orchestrator fabric generated by AGI Jobs v0 (v2). All subsystems validated for owner-overridden stewardship.
      </footer>
    </body>
  </html>`;

  writeFileSync(join(reportDir, 'dashboard.html'), html, 'utf8');
}
