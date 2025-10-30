"""MuZero-style AGI Jobs planning demo package."""
from . import torch_compat as _torch_compat
from .configuration import DemoConfig, load_demo_config
from .environment import AGIJobsPlanningEnv, EnvironmentConfig, PlannerObservation, StepResult, vector_size
from .mcts import MuZeroPlanner, PlannerSettings
from .network import MuZeroNetwork, NetworkConfig, make_network
from .sentinel import SentinelConfig, SentinelMonitor, SentinelStatus
from .thermostat import PlanningThermostat, ThermostatConfig
from .training import Episode, MuZeroTrainer, TrainingConfig, discount_returns

_torch_compat.patch_torch_from_numpy()
del _torch_compat

__all__ = [
    "AGIJobsPlanningEnv",
    "DemoConfig",
    "EnvironmentConfig",
    "Episode",
    "MuZeroNetwork",
    "MuZeroPlanner",
    "MuZeroTrainer",
    "NetworkConfig",
    "PlannerObservation",
    "PlannerSettings",
    "PlanningThermostat",
    "SentinelConfig",
    "SentinelMonitor",
    "SentinelStatus",
    "StepResult",
    "ThermostatConfig",
    "TrainingConfig",
    "discount_returns",
    "load_demo_config",
    "make_network",
    "vector_size",
]
