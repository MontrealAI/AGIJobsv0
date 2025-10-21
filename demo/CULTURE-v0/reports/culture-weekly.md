# CULTURE Weekly Report – Week 1

| Metric | Value | Verification |
|--------|-------|--------------|
| New artifacts | 5 | Cross-checked via indexer SQL snapshot `artifacts_2024w01.sql`. |
| Avg citations / artifact | 1.4 | Calculated using PageRank audit notebook (`notebooks/culture-pagerank.ipynb`). |
| Max lineage depth | 3 | Verified by DFS traversal in `store.ts` integration test. |
| Influence Gini | 0.21 | Independent computation with Python `gini.py`. |
| Jobs spawned from artifacts | 8 | Correlated orchestrator journal vs on-chain JobRegistry events. |

Top Influential Artifacts:

1. **Artifact 12 – "Guide to Self-Play Pedagogy"** – Influence 0.31 (cited by 3 artifacts, used in 2 arena rounds)
2. **Artifact 7 – "Curriculum of Strategic Reasoning"** – Influence 0.24 (spawned 3 derivative jobs)
3. **Artifact 3 – "Dataset: Adaptive Problem Bank"** – Influence 0.18 (validated in QA replay)

Operational Notes:
- No moderation incidents triggered.
- IPFS redundancy test succeeded (Infura + local gateway).
- Owner executed pause/unpause drill – both contracts resumed without incident.
