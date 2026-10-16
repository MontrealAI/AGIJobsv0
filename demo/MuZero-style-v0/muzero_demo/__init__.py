"""MuZero-style planning demo with lazy optional runtime dependencies."""

from importlib import import_module

_EXPORTS = {
    "DemoConfig": "configuration",
    "load_demo_config": "configuration",
    "AGIJobsPlanningEnv": "environment",
    "EnvironmentConfig": "environment",
    "PlannerObservation": "environment",
    "StepResult": "environment",
    "vector_size": "environment",
    "MuZeroPlanner": "mcts",
    "PlannerSettings": "mcts",
    "MuZeroNetwork": "network",
    "NetworkConfig": "network",
    "make_network": "network",
    "SentinelConfig": "sentinel",
    "SentinelMonitor": "sentinel",
    "SentinelStatus": "sentinel",
    "PlanningThermostat": "thermostat",
    "ThermostatConfig": "thermostat",
    "Episode": "training",
    "MuZeroTrainer": "training",
    "TrainingConfig": "training",
    "discount_returns": "training",
}
__all__ = list(_EXPORTS)


def __getattr__(name):
    module = _EXPORTS.get(name)
    if module is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    from .torch_compat import patch_torch_from_numpy

    patch_torch_from_numpy()
    value = getattr(import_module(f".{module}", __name__), name)
    globals()[name] = value
    return value
