# Thermostat Control Service

The thermostat service provides a feedback controller that monitors economic
metrics (GMV, spend, ROI) and dynamically tunes the Hierarchical Generative
Machine (HGM) orchestration parameters. The controller consumes metric streams
from Prometheus or synthetic fixtures, computes rolling ROI averages, and
applies heuristic adjustments to the HGM engine through the orchestrator's
thread-safe APIs.

## Components

- **`ThermostatController`** – maintains a sliding window of ROI samples,
  detects dips/surges around the configured target, and adjusts the engine's
  `widening_alpha` and `thompson_prior` parameters. Adjustments are throttled by
  a configurable cooldown.
- **`MetricSample`** – lightweight data class for transporting ROI observations
  from monitoring pipelines.
- **Operator CLI** (`scripts/thermostat.py`) – offers `watch` and `replay`
  subcommands to stream metrics from Prometheus or replay captured JSON logs.
  Use `--dry-run` to inspect recommended actions without mutating the live
  workflow.

## Tuning guidance

| Scenario              | Suggested tweak                                       |
|-----------------------|--------------------------------------------------------|
| ROI consistently low  | Increase `widening_alpha` and `thompson_prior` to encourage exploration.<br>The defaults apply a modest bump of `+0.05` and `+0.1` respectively per intervention. |
| ROI consistently high | Decrease both parameters to reduce exploratory spend and favour exploitation. |

The controller clamps adjustments within `[min, max]` bounds to prevent runaway
values. Operators can tighten or loosen the response by modifying `--window`,
`--cooldown`, or step sizes on the CLI.

## Manual overrides

1. Run `scripts/thermostat.py watch --dry-run ...` to observe the proposed
   adjustments without applying them.
2. To enforce a specific configuration, supply smaller step sizes (e.g.
   `--widening-step 0.01 --thompson-step 0.02`) and run in non dry-run mode. The
   controller will converge to the new steady state over successive ROI windows.
3. If an emergency freeze is needed, stop the thermostat process or run with
   `--dry-run` so the workflow remains untouched while metrics continue to be
   inspected.

Synthetic fixtures for unit tests are available under
`services/thermostat/tests/` and can be extended to cover additional edge
cases.
