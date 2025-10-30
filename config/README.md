# Configuration profiles

The repository keeps canonical module manifests under `config/` while allowing
profile-specific overrides. The **AGIALPHA** profile ships curated defaults for
high-growth mission (HGM) orchestration, thermostat tuning, and sentinel
guardrails.

## Directory layout

- `config/*.json` – network-agnostic defaults consumed by scripts and runtime
  services.
- `config/agialpha/*.json` – overrides applied when the AGIALPHA profile is
  active. These files introduce controller targets, agent priors, and budget
  envelopes tailored for AGIALPHA deployments.

## Activating the AGIALPHA profile

Set `AGIALPHA_PROFILE` to enable the overrides when running scripts or services:

```bash
export AGIALPHA_PROFILE=agialpha
```

Truth-y values such as `1`, `true`, or `on` also activate the profile. Any
false-y value (`0`, `false`, `off`, `none`) disables it. When the variable is
unset the loaders fall back to the base `config/*.json` files, so non-HGM
workloads remain unaffected.

### Local development

Run configuration validation and tests with the profile enabled:

```bash
AGIALPHA_PROFILE=agialpha node scripts/validate-config.js
AGIALPHA_PROFILE=agialpha pytest tests/config/test_profile_loader.py
```

### CI/CD pipelines

In GitHub Actions, CircleCI, or similar systems export the variable before
invoking validation or test jobs:

```bash
env:
  AGIALPHA_PROFILE: agialpha
```

Every pipeline should include the validation script to enforce schema
constraints for the HGM, thermostat, and sentinel manifests.
