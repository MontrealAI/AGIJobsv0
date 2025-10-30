"""High-level planner that wraps MCTS, thermostat, and sentinel."""
from __future__ import annotations

from typing import Dict, List, Tuple

import torch

from .environment import JobsEnvironment
from .mcts import MCTS
from .network import MuZeroNetwork
from .sentinel import Sentinel
from .thermostat import PlanningThermostat
from .telemetry import TelemetrySink


class MuZeroPlanner:
    def __init__(self, config: Dict, network: MuZeroNetwork, device: torch.device) -> None:
        self.config = config
        self.network = network.to(device)
        self.device = device
        self.planner_conf = config.get("planner", {})
        self.default_simulations = int(self.planner_conf.get("default_simulations", 64))
        self.max_simulations = int(self.planner_conf.get("max_simulations", 128))
        self.temperature = float(self.planner_conf.get("temperature", 1.0))
        self.scheduler = self.planner_conf.get("visit_temperature_schedule", {})
        self.mcts = MCTS(self.network, config)
        self.thermostat = PlanningThermostat(config)
        self.sentinel = Sentinel(config)
        self.telemetry = TelemetrySink(config)
        self.episode_index = 0

    def plan(self, env: JobsEnvironment, observation: List[float], forced_simulations: int | None = None) -> Tuple[int, List[float], Dict[str, float]]:
        obs_tensor = torch.tensor(observation, dtype=torch.float32, device=self.device)
        base_simulations = forced_simulations if forced_simulations is not None else self.default_simulations
        root, visit_counts = self.mcts.run(obs_tensor, base_simulations)
        total_visits = sum(visit_counts) + 1e-6
        policy = [count / total_visits for count in visit_counts]
        entropy = self.thermostat.entropy(policy)
        best_visits = sorted(visit_counts, reverse=True)
        gap = 0.0
        if len(best_visits) > 1:
            gap = abs(best_visits[0] - best_visits[1]) / max(best_visits[0], 1e-6)
        simulations = self.thermostat.decide(base_simulations, entropy, gap)
        if simulations != base_simulations:
            root, visit_counts = self.mcts.run(obs_tensor, simulations)
            total_visits = sum(visit_counts) + 1e-6
            policy = [count / total_visits for count in visit_counts]
        temperature = self._temperature_for_episode()
        final_policy = self.mcts.final_policy(visit_counts, temperature)
        policy_tensor = torch.tensor(final_policy, dtype=torch.float32, device=self.device)
        policy_tensor = torch.nan_to_num(policy_tensor, nan=1.0 / len(final_policy), posinf=1.0, neginf=1e-6)
        policy_tensor = torch.clamp(policy_tensor, min=1e-6)
        policy_tensor = policy_tensor / policy_tensor.sum()
        action = int(torch.multinomial(policy_tensor, 1).item())
        final_policy = policy_tensor.cpu().tolist()
        expected_value = root.value()
        self.telemetry.record(
            "planning_decision",
            {
                "episode": self.episode_index,
                "action": action,
                "expected_value": expected_value,
                "temperature": temperature,
                "entropy": entropy,
                "simulations": simulations,
            },
        )
        return action, final_policy, {"expected_value": expected_value, "simulations": simulations}

    def observe_outcome(self, predicted_value: float, realised_return: float) -> None:
        self.sentinel.update(predicted_value, realised_return)
        if self.sentinel.should_fallback():
            self.telemetry.record("sentinel_trigger", {"ema_error": predicted_value - realised_return})
        self.telemetry.flush()

    def reset_episode(self) -> None:
        self.episode_index += 1
        self.sentinel.reset()

    def _temperature_for_episode(self) -> float:
        warmup = int(self.scheduler.get("warmup_episode", 0))
        min_temp = float(self.scheduler.get("min_temperature", 0.05))
        if self.episode_index <= warmup:
            return max(self.temperature, min_temp)
        return min_temp
