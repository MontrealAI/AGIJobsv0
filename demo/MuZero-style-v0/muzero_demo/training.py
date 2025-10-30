"""Simplified MuZero training loop tailored for the demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple
import random

import numpy as np
import torch
from torch import optim

from .environment import AGIJobsPlanningEnv, EnvironmentConfig
from .mcts import MuZeroPlanner, PlannerSettings
from .network import MuZeroNetwork, NetworkConfig


@dataclass
class TrainingConfig:
    environment: EnvironmentConfig
    network: NetworkConfig
    planner: PlannerSettings
    batch_size: int = 32
    unroll_steps: int = 3
    td_steps: int = 5
    learning_rate: float = 1e-3
    discount: float = 0.997
    replay_buffer_size: int = 2048
    policy_weight: float = 1.0
    value_weight: float = 0.5
    reward_weight: float = 0.5
    temperature: float = 1.0
    device: str = "cpu"


@dataclass
class Episode:
    observations: List[np.ndarray]
    actions: List[int]
    rewards: List[float]
    policies: List[np.ndarray]
    values: List[float]

    def length(self) -> int:
        return len(self.actions)


class ReplayBuffer:
    def __init__(self, capacity: int) -> None:
        self.capacity = capacity
        self._buffer: List[Episode] = []

    def add(self, episode: Episode) -> None:
        if len(self._buffer) >= self.capacity:
            self._buffer.pop(0)
        self._buffer.append(episode)

    def sample(self, batch_size: int) -> List[Tuple[Episode, int]]:
        samples: List[Tuple[Episode, int]] = []
        for _ in range(batch_size):
            episode = random.choice(self._buffer)
            index = random.randrange(episode.length())
            samples.append((episode, index))
        return samples

    def __len__(self) -> int:  # pragma: no cover - trivial
        return len(self._buffer)


class MuZeroTrainer:
    def __init__(self, network: MuZeroNetwork, config: TrainingConfig) -> None:
        self.network = network.to(config.device)
        self.config = config
        self.buffer = ReplayBuffer(config.replay_buffer_size)
        self.optimizer = optim.Adam(self.network.parameters(), lr=config.learning_rate)
        self.env = AGIJobsPlanningEnv(config.environment)
        self.planner = MuZeroPlanner(network, config.planner)

    def self_play(self, episodes: int) -> None:
        for _ in range(episodes):
            episode = self._play_episode()
            self.buffer.add(episode)

    def _play_episode(self) -> Episode:
        observation = self.env.reset()
        observations: List[np.ndarray] = []
        actions: List[int] = []
        rewards: List[float] = []
        policies: List[np.ndarray] = []
        values: List[float] = []

        done = False
        while not done:
            obs_tensor = torch.from_numpy(observation.vector).float().to(self.config.device)
            policy, root_value, _ = self.planner.run(obs_tensor, observation.legal_actions)
            action = self._select_action(policy, observation.legal_actions)

            observations.append(observation.vector.copy())
            actions.append(action)
            policies.append(policy.cpu().numpy())
            values.append(root_value)

            step_result = self.env.step(action)
            rewards.append(step_result.reward)
            observation = step_result.observation
            done = step_result.done
        return Episode(observations=observations, actions=actions, rewards=rewards, policies=policies, values=values)

    def _select_action(self, policy: torch.Tensor, legal_actions: List[int]) -> int:
        probs = policy.clone()
        mask = torch.zeros_like(probs)
        mask[legal_actions] = 1.0
        probs = probs * mask
        total = probs.sum()
        if total <= 0:
            probs = torch.ones_like(probs) / probs.numel()
        else:
            probs = probs / total
        distribution = torch.distributions.Categorical(probs=probs)
        return int(distribution.sample().item())

    def train_step(self) -> Dict[str, float]:
        if len(self.buffer) < self.config.batch_size:
            return {"loss": 0.0}
        batch = self.buffer.sample(self.config.batch_size)
        total_loss = 0.0
        self.optimizer.zero_grad()
        for episode, index in batch:
            loss = self._compute_loss(episode, index)
            loss.backward()
            total_loss += float(loss.item())
        torch.nn.utils.clip_grad_norm_(self.network.parameters(), max_norm=10.0)
        self.optimizer.step()
        return {"loss": total_loss / self.config.batch_size}

    def _compute_loss(self, episode: Episode, index: int) -> torch.Tensor:
        config = self.config
        device = config.device
        observation = torch.from_numpy(episode.observations[index]).float().to(device)
        policy_targets = [
            torch.from_numpy(episode.policies[min(index + k, len(episode.policies) - 1)]).float().to(device)
            for k in range(self.config.unroll_steps + 1)
        ]

        policy_logits, value, hidden_state = self.network.initial_inference(observation.unsqueeze(0))
        predictions_policy = [policy_logits.squeeze(0)]
        predictions_value = [value.squeeze(0)]
        predictions_reward: List[torch.Tensor] = [torch.zeros(1, device=device)]
        states = [hidden_state]

        actions = episode.actions[index : index + config.unroll_steps]
        for action in actions:
            action_tensor = torch.tensor([action], dtype=torch.long, device=device)
            policy_logits, value, reward, next_state = self.network.recurrent_inference(states[-1], action_tensor)
            predictions_policy.append(policy_logits.squeeze(0))
            predictions_value.append(value.squeeze(0))
            predictions_reward.append(reward)
            states.append(next_state)

        target_values = torch.tensor(self._target_values(episode, index), dtype=torch.float32, device=device)
        target_rewards = torch.tensor(self._target_rewards(episode, index), dtype=torch.float32, device=device)

        loss = torch.tensor(0.0, device=device)
        weights = {
            "policy": self.config.policy_weight,
            "value": self.config.value_weight,
            "reward": self.config.reward_weight,
        }
        for k in range(len(predictions_policy)):
            policy_target = policy_targets[min(k, len(policy_targets) - 1)]
            targets = {
                "policy": policy_target,
                "value": target_values[min(k, target_values.shape[0] - 1)],
                "reward": target_rewards[min(k, target_rewards.shape[0] - 1)],
            }
            predictions = {
                "policy_logits": predictions_policy[k],
                "value": predictions_value[k],
                "reward": predictions_reward[k],
            }
            loss = loss + self.network.loss(predictions, targets, weights)
        return loss / len(predictions_policy)

    def _target_values(self, episode: Episode, index: int) -> List[float]:
        targets: List[float] = []
        for k in range(self.config.unroll_steps + 1):
            total = 0.0
            discount = 1.0
            for i in range(self.config.td_steps):
                pos = index + k + i
                if pos < len(episode.rewards):
                    total += discount * episode.rewards[pos]
                    discount *= self.config.discount
                else:
                    break
            bootstrap_index = index + k + self.config.td_steps
            if bootstrap_index < len(episode.values):
                total += discount * episode.values[bootstrap_index]
            targets.append(total)
        return targets

    def _target_rewards(self, episode: Episode, index: int) -> List[float]:
        rewards: List[float] = []
        for k in range(self.config.unroll_steps + 1):
            pos = index + k
            if pos < len(episode.rewards):
                rewards.append(episode.rewards[pos])
            else:
                rewards.append(0.0)
        return rewards
