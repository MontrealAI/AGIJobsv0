# Full Governance Demonstration Run
*Generated at:* 2025-10-20T16:59:46.651Z
*Total runtime:* 83.93 s

```mermaid
graph LR
  A[Generate dossier ✅]:::success
  B[Validate physics ✅]:::success
  C[Audit CI shield ✅]:::success
  D[Owner diagnostics ⚠️]:::warning
  A --> B
  B --> C
  C --> D
  classDef success fill:#0f172a,stroke:#22d3ee,stroke-width:2px,color:#f8fafc;
  classDef warning fill:#1f2937,stroke:#f97316,stroke-width:2px,color:#fde68a;
  classDef error fill:#450a0a,stroke:#ef4444,stroke-width:2px,color:#fee2e2;
  classDef neutral fill:#111827,stroke:#64748b,stroke-width:2px,color:#cbd5f5;
```

| Step | Status | Duration | Details |
| --- | --- | --- | --- |
| Generate dossier | ✅ | 31.83 s | \|F\|r\|e\|e\|-\|e\|n\|e\|r\|g\|y\| \|m\|a\|r\|g\|i\|n\| \|6\|9\|8\|0\|0\|.\|0\|0\| \|k\|J\| \|·\| \|M\|a\|x\| \|m\|e\|t\|h\|o\|d\| \|d\|e\|v\|i\|a\|t\|i\|o\|n\| \|0\|.\|1\|3\|6\|5\|1\|5\| |
| Validate physics | ✅ | 33.10 s | \|A\|l\|l\| \|5\|8\| \|c\|h\|e\|c\|k\|s\| \|p\|a\|s\|s\|e\|d\| |
| Audit CI shield | ✅ | 0.02 s | \|A\|l\|l\| \|e\|n\|f\|o\|r\|c\|e\|m\|e\|n\|t\| \|g\|u\|a\|r\|d\|s\| \|l\|o\|c\|k\|e\|d\|.\| |
| Owner diagnostics | ⚠️ | 18.99 s | \|W\|a\|r\|n\|i\|n\|g\|s\|:\| \|[\|o\|w\|n\|e\|r\|:\|a\|u\|d\|i\|t\|-\|h\|a\|m\|i\|l\|t\|o\|n\|i\|a\|n\|]\| \|E\|R\|R\|O\|R\| \|@\| \|$\|.\|o\|n\|C\|h\|a\|i\|n\| \|—\| \|H\|H\|7\|0\|0\|:\| \|A\|r\|t\|i\|f\|a\|c\|t\| \|f\|o\|r\| \|c\|o\|n\|t\|r\|a\|c\|t\| \|"\|c\|o\|n\|t\|r\|a\|c\|t\|s\|/\|v\|2\|/\|H\|a\|m\|i\|l\|t\|o\|n\|i\|a\|n\|M\|o\|n\|i\|t\|o\|r\|.\|s\|o\|l\|:\|H\|a\|m\|i\|l\|t\|o\|n\|i\|a\|n\|M\|o\|n\|i\|t\|o\|r\|"\| \|n\|o\|t\| \|f\|o\|u\|n\|d\|.\| \||\| \|C\|r\|o\|s\|s\|-\|c\|h\|e\|c\|k\| \|m\|i\|s\|m\|a\|t\|c\|h\|:\| \|m\|i\|s\|s\|i\|o\|n\| \|a\|l\|i\|g\|n\|m\|e\|n\|t\|.\| \||\| \|[\|r\|e\|w\|a\|r\|d\|-\|e\|n\|g\|i\|n\|e\|:\|r\|e\|p\|o\|r\|t\|]\| \|E\|R\|R\|O\|R\| \|@\| \|$\|.\|o\|n\|C\|h\|a\|i\|n\| \|—\| \|H\|H\|7\|0\|0\|:\| \|A\|r\|t\|i\|f\|a\|c\|t\| \|f\|o\|r\| \|c\|o\|n\|t\|r\|a\|c\|t\| \|"\|c\|o\|n\|t\|r\|a\|c\|t\|s\|/\|v\|2\|/\|R\|e\|w\|a\|r\|d\|E\|n\|g\|i\|n\|e\|M\|B\|.\|s\|o\|l\|:\|R\|e\|w\|a\|r\|d\|E\|n\|g\|i\|n\|e\|M\|B\|"\| \|n\|o\|t\| \|f\|o\|u\|n\|d\|.\| \||\| \|[\|o\|w\|n\|e\|r\|:\|u\|p\|g\|r\|a\|d\|e\|-\|s\|t\|a\|t\|u\|s\|]\| \|S\|K\|I\|P\|P\|E\|D\| \|@\| \|$\|.\|o\|n\|C\|h\|a\|i\|n\| \|—\| \|N\|o\| \|t\|i\|m\|e\|l\|o\|c\|k\| \|a\|d\|d\|r\|e\|s\|s\| \|a\|v\|a\|i\|l\|a\|b\|l\|e\|.\| \||\| \|[\|o\|w\|n\|e\|r\|:\|c\|o\|m\|p\|l\|i\|a\|n\|c\|e\|-\|r\|e\|p\|o\|r\|t\|]\| \|S\|K\|I\|P\|P\|E\|D\| \|@\| \|$\|.\|o\|n\|C\|h\|a\|i\|n\| \|—\| \|N\|o\| \|t\|a\|x\| \|p\|o\|l\|i\|c\|y\| \|a\|d\|d\|r\|e\|s\|s\| \|c\|o\|n\|f\|i\|g\|u\|r\|e\|d\|.\| |

## Key Metrics
- Gibbs free energy: 69800.00 kJ
- Free-energy margin: 69800.00 kJ
- Antifragility curvature (2a): 1.59e+1
- Equilibrium max deviation: 0.136515
- Risk portfolio residual: 0.214
- Alpha-field confidence: 82.9%
- Superintelligence index: 82.1% (✅)
- Stackelberg bound respected: ✅
- Thermodynamic assurance: 100.0%
- Governance assurance: 28.5%
- Antifragility assurance: 100.0%
- Owner assurance: 100.0%
- Quantum coherence: 82.1% (aligned charge)
- Quantum free-energy delta: 6.980e+4 kJ
- Thermo ↔ quantum alignment: ⚠️ (limit 4.500e+2 kJ)
- Quantum state entropy: 1.288 bits
- Energy margin floor met: ✅
- Jacobian stable: ❌
- Owner capability coverage: ✅
- All owner commands present: ✅
- All owner verification scripts present: ✅
- Owner supremacy index: 100.0% (✅)
- CI shield: ✅ enforced
- Owner readiness: attention

## Artifact Index
- Governance dossier: `/workspace/AGIJobsv0/demo/agi-governance/reports/governance-demo-report.md`
- Physics summary: `/workspace/AGIJobsv0/demo/agi-governance/reports/governance-demo-summary.json`
- Interactive dashboard: `/workspace/AGIJobsv0/demo/agi-governance/reports/governance-demo-dashboard.html`
- Owner matrix JSON: `/workspace/AGIJobsv0/demo/agi-governance/reports/governance-demo-owner-matrix.json`
- Owner matrix Markdown: `/workspace/AGIJobsv0/demo/agi-governance/reports/governance-demo-owner-matrix.md`
- Validation JSON: `/workspace/AGIJobsv0/demo/agi-governance/reports/governance-demo-validation.json`
- Validation Markdown: `/workspace/AGIJobsv0/demo/agi-governance/reports/governance-demo-validation.md`
- CI verification: `/workspace/AGIJobsv0/demo/agi-governance/reports/ci-verification.json`
- Owner diagnostics JSON: `/workspace/AGIJobsv0/demo/agi-governance/reports/owner-diagnostics.json`
- Owner diagnostics Markdown: `/workspace/AGIJobsv0/demo/agi-governance/reports/owner-diagnostics.md`
- Full-run JSON: `/workspace/AGIJobsv0/demo/agi-governance/reports/governance-demo-full-run.json`
- Full-run Markdown: `/workspace/AGIJobsv0/demo/agi-governance/reports/governance-demo-full-run.md`
- Manifest: `/workspace/AGIJobsv0/demo/agi-governance/reports/governance-demo-manifest.json`

> ✅ CI shield verified with all guards active.
> ⚠️ Owner automation warnings: 4, errors: 0