# One-Pass Bootstrap with Helm

This document describes how to deploy the entire AGI stack in a single Helm install, covering chart dependencies, secrets, and validation.

## Prerequisites

- Kubernetes cluster (1.25+) with storage class for StatefulSets.
- `kubectl` configured and authenticated.
- Helm 3.12+.
- Access to the secrets manager providing KMS URIs (AWS KMS, GCP KMS, or Hashicorp Vault).
- DNS entry for the public ingress host.

## 1. Prepare Values

Create `bootstrap-values.yaml` by copying the sample below and updating the placeholders with production values.

```yaml
global:
  chainId: 8453
  rpc:
    primary: https://mainnet.example.rpc
    fallback: https://backup.rpc
  contracts:
    entryPoint: "0x..."
    paymaster: "0x..."
    aaRegistry: "0x..."
    eas:
      schemaUID: "0x..."
  cors:
    allowOrigins:
      - https://portal.example.com
  rateLimits:
    orchestrator:
      rps: 40
      burst: 80
    bundler:
      rps: 100
      burst: 200
  secrets:
    kmsKeyring: projects/app/locations/global/keyRings/prod
    orchestratorEnv: ""
    attesterKeyUri: projects/app/.../attester
    paymasterKeyUri: projects/app/.../paymaster
orchestrator:
  image:
    repository: ghcr.io/company/orchestrator
    digest: sha256:...
  env:
    LOG_LEVEL: info
bundler:
  image:
    repository: ghcr.io/company/bundler
    digest: sha256:...
paymaster-supervisor:
  image:
    repository: ghcr.io/company/paymaster-supervisor
    digest: sha256:...
attester:
  image:
    repository: ghcr.io/company/attester
    digest: sha256:...
ingress:
  host: agi.example.com
  tls:
    enabled: true
    secretName: agi-stack-tls
```

## 2. Fetch Dependencies

```bash
helm dependency build deploy/helm
```

## 3. Install the Stack

```bash
helm install agi-stack deploy/helm -f bootstrap-values.yaml
```

The dependencies include orchestrator, bundler, paymaster supervisor, IPFS, graph-node, postgres, attester, and ingress. Helm renders pinned image digests by default when `.Values.<component>.image.digest` is provided, guaranteeing immutability.

## 4. Validate Install

- `kubectl get pods -l app.kubernetes.io/instance=agi-stack` should show all pods running.
- `kubectl get ingress agi-stack-gateway` should expose the configured host with TLS.
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
- HSTS, strict body-size limits, and basic rate limits are pre-populated in `values.yaml` under `ingress.annotations`; adjust to your production thresholds.
- Configure Kubernetes NetworkPolicies to restrict namespace traffic.
- Sync SBOM artifacts from the CI workflow to your compliance store.
