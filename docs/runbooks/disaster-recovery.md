# Disaster Recovery Runbook

## Objectives
- Restore AGI stack functionality within 60 minutes of a regional outage.
- Recover receipts and attestation state with < 5 minutes of data loss.

## Recovery Sites
- **Primary**: GKE `us-central1`
- **Secondary**: GKE `europe-west1`

## DR Checklist
1. Declare incident and page DR lead.
2. Snapshot current Helm values artifact from Git (`deploy/helm/values.yaml`).
3. In secondary region, run the One-Pass Bootstrap guide with the latest pinned image digests.
4. Restore Postgres from the most recent `pg_basebackup` stored in GCS (`gs://agi-backups/subgraph`).
5. Sync IPFS pins using the `ipfs-cluster-ctl sync` command against the backup cluster.
6. Update DNS records (Cloudflare) to point ingress hosts to the secondary load balancer.
7. Validate health via Grafana and synthetic checks.

## Failback
1. Once primary region is restored, resync database replication.
2. Cut traffic back to primary using Cloudflare load balancing.
3. Scale down secondary cluster to warm standby.

## Data Validation
- Run attestation receipt reconciliation script (`tools/reconcile-receipts.ts`).
- Confirm `service:subgraph_lag_blocks` returns to < 5.

## Change Log
- v1.0 – Initial DR plan.
