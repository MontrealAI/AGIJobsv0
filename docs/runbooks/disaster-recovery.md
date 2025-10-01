# Disaster Recovery Plan

## Objectives
- **RTO**: 60 minutes
- **RPO**: 15 minutes

## Secondary environment
- Region: us-west2
- Kubernetes cluster: `aa-dr`
- Data replication: PostgreSQL streaming replication via Cloud SQL cross-region replicas.

## Activation checklist
1. Declare incident in `#aa-incident` and page SRE + Security.
2. Run GitHub workflow `dr-start` with parameters:
   - `environment=mainnet`
   - `image-digests` pointing to the latest signed release.
3. Verify the Helm release `aa-stack` in the DR cluster:
   ```bash
   kubectl --context=aa-dr get pods -n aa
   ```
4. Promote the read replica to primary.
5. Update DNS via Cloudflare to point to the DR ingress IP.
6. Broadcast status update to stakeholders.

## Repatriation
1. Stabilize primary region and confirm readiness.
2. Reverse DNS changes to primary ingress.
3. Demote DR database to replica and resubscribe replication.
4. Scale DR workloads to zero but keep cluster warm for 24 hours.

## Testing cadence
- Quarterly failover drills using synthetic traffic.
- Document outcomes in the reliability wiki and update runbooks accordingly.
