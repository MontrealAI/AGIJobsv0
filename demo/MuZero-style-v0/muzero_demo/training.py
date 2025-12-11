"""Training utilities for the MuZero-style demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Sequence

import numpy as np
import torch
import torch.nn.functional as F
import torch.optim as optim

from .environment import EnvironmentConfig
from .mcts import PlannerSettings
from .network import MuZeroNetwork, NetworkOutput
from .replay import ReplayBuffer, Transition


@dataclass
class TrainingConfig:
    """Training hyper-parameters used by the demo."""

    batch_size: int = 32
    unroll_steps: int = 5
    td_steps: int = 5
    learning_rate: float = 8e-4
    weight_decay: float = 1e-6
    replay_capacity: int = 2048
    discount: float = 0.997
    reanalyse_ratio: float = 0.25
    value_loss_weight: float = 1.0
    reward_loss_weight: float = 1.0
    policy_loss_weight: float = 1.0
    checkpoint_interval: int = 16
    environment: EnvironmentConfig = field(default_factory=EnvironmentConfig)
    planner: PlannerSettings = field(default_factory=PlannerSettings)


@dataclass
class Episode:
    """Container representing a self-play episode."""

    observations: List[np.ndarray]
    actions: List[int]
    rewards: List[float]
    policies: List[np.ndarray]
    values: List[float]
    returns: List[float]
    simulations: List[int]
    summary: Dict[str, float]


def discount_returns(rewards: Sequence[float], discount: float) -> List[float]:
    running = 0.0
    discounted: List[float] = []
    for reward in reversed(rewards):
        running = reward + discount * running
        discounted.insert(0, running)
    return discounted


class MuZeroTrainer:
    """Simple trainer orchestrating replay sampling and optimisation."""

    def __init__(self, config: TrainingConfig, network: MuZeroNetwork, device: torch.device) -> None:
        self.config = config
        self.network = network.to(device)
        self.device = device
        self.replay = ReplayBuffer(config.replay_capacity)
        self.optimizer = optim.Adam(self.network.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay)

    def store_episode(self, episode: Iterable[Transition]) -> None:
        self.replay.extend_episode(episode)

    def self_play(self, env: AGIJobsPlanningEnv, planner: "MuZeroPlanner", episodes: int = 1) -> None:
        """Generate experience by rolling out the planner inside ``env``."""

        for _ in range(episodes):
            observation = env.reset()
            planner.reset_episode()
            discount_power = 1.0
            episode: List[Transition] = []
            while not env.done:
                action, policy, meta = planner.plan(env, observation)
                step = env.step(action)
                reward = step.reward * discount_power
                expected_value = float(meta.get("expected_value", reward)) if isinstance(meta, dict) else float(reward)
                episode.append(
                    Transition(
                        observation=observation.vector.tolist(),
                        action=action,
                        reward=float(reward),
                        policy=list(policy),
                        value=expected_value,
                    )
                )
                planner.observe_outcome(expected_value, reward)
                observation = step.observation
                discount_power *= self.config.environment.discount
            self.store_episode(episode)

    def train_step(self) -> Dict[str, float]:
        if len(self.replay) == 0:
            return {"loss": 0.0, "policy_loss": 0.0, "value_loss": 0.0, "reward_loss": 0.0}

        batch = self.replay.sample(self.config.batch_size)
        observations = torch.tensor([t.observation for t in batch], dtype=torch.float32, device=self.device)
        rewards = torch.tensor([t.reward for t in batch], dtype=torch.float32, device=self.device).unsqueeze(-1)
        target_policies = torch.tensor([t.policy for t in batch], dtype=torch.float32, device=self.device)
        target_values = torch.tensor([t.value for t in batch], dtype=torch.float32, device=self.device).unsqueeze(-1)

        output: NetworkOutput = self.network.initial_inference(observations)
        policy_loss = F.cross_entropy(output.policy_logits, torch.argmax(target_policies, dim=-1))
        value_loss = F.mse_loss(output.value, target_values)
        reward_loss = F.mse_loss(output.reward, rewards)

        loss = (
            self.config.policy_loss_weight * policy_loss
            + self.config.value_loss_weight * value_loss
            + self.config.reward_loss_weight * reward_loss
        )

        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.network.parameters(), max_norm=5.0)
        self.optimizer.step()

        return {
            "loss": float(loss.item()),
            "policy_loss": float(policy_loss.item()),
            "value_loss": float(value_loss.item()),
            "reward_loss": float(reward_loss.item()),
        }

    def save_checkpoint(self, path: str) -> None:
        checkpoint = {
            "model_state": self.network.state_dict(),
            "optimizer_state": self.optimizer.state_dict(),
            "config": self.config,
        }
        torch.save(checkpoint, path)


__all__ = ["Episode", "MuZeroTrainer", "TrainingConfig", "discount_returns"]
