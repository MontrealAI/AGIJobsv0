# One-Pass Bootstrap with Helm

This document describes how to deploy the entire AGI stack in a single Helm install, covering chart dependencies, secrets, and validation.

## Prerequisites

- Kubernetes cluster (1.25+) with storage class for StatefulSets.
- kubectl configured and authenticated.
- Helm 3.12+.
- Access to the secrets manager providing KMS URIs (AWS KMS, GCP KMS, or Hashicorp Vault).
- DNS entry for the public ingress host.

## 1. Prepare Values

Create `bootstrap-values.yaml` by copying the sample below and updating the placeholders with production values.

```yaml
global:
  environment: mainnet
  chain:
    id: 8453
    rpcURLs:
      - https://mainnet.example.rpc
    fallbackRPCURLs:
      - https://backup.rpc
  contracts:
    bundler: "0x..."
    paymaster: "0x..."
    easRegistry: "0x..."
    easSchemaUID: "0x..."
  cors:
    allowedOrigins:
      - https://portal.example.com
  secrets:
    kmsKeys:
      attester: projects/app/locations/global/keyRings/prod/cryptoKeys/attester
      paymaster: projects/app/locations/global/keyRings/prod/cryptoKeys/paymaster
  ingress:
    host: agi.example.com
    className: nginx
```

## 2. Fetch Dependencies

```bash
helm dependency build deploy/helm/agi-stack
```

## 3. Install the Stack

```bash
helm install agi-stack deploy/helm/agi-stack -f bootstrap-values.yaml
```

The dependencies include orchestrator, bundler, paymaster supervisor, IPFS, graph-node, postgres, attester, and ingress. Helm renders pinned image digests by default when `.Values.*.image.digest` is provided, guaranteeing immutability.

## 4. Validate Install

- `kubectl get pods -l app.kubernetes.io/instance=agi-stack` should show all pods running.
- `kubectl get ingress agi-stack-ingress` should expose the configured host with TLS.
- Use the Grafana dashboard from `monitoring/grafana/dashboard-agi-ops.json` to confirm metrics emit within 15 minutes.

## 5. Uninstall Cleanly

```bash
helm uninstall agi-stack
```

- All Deployments, StatefulSets, Services, and ConfigMaps are removed.
- PersistentVolumeClaims remain only if `persistence.enabled` is set; otherwise the release is fully cleaned.
- Use `kubectl get pvc` to confirm there are no orphaned volumes.

## 6. Post-Install Hardening Checklist

- Configure WAF rules on the ingress controller for IP throttling.
- Enable HSTS by adding `nginx.ingress.kubernetes.io/hsts: "true"` to the ingress annotations.
- Configure Kubernetes NetworkPolicies to restrict namespace traffic.
- Sync SBOM artifacts from the CI workflow to your compliance store.
