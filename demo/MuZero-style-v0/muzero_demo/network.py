"""MuZero network components implemented with PyTorch."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class MuZeroNetworkOutput:
    policy_logits: torch.Tensor
    value: torch.Tensor
    reward: torch.Tensor
    hidden_state: torch.Tensor


class RepresentationNet(nn.Module):
    def __init__(self, observation_dim: int, latent_dim: int, hidden_dim: int) -> None:
        super().__init__()
        self.fc1 = nn.Linear(observation_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, latent_dim)

    def forward(self, observation: torch.Tensor) -> torch.Tensor:
        x = F.relu(self.fc1(observation))
        hidden = torch.tanh(self.fc2(x))
        return hidden


class DynamicsNet(nn.Module):
    def __init__(self, latent_dim: int, action_dim: int, hidden_dim: int) -> None:
        super().__init__()
        self.action_embed = nn.Embedding(action_dim, hidden_dim)
        self.fc1 = nn.Linear(latent_dim + hidden_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, latent_dim)
        self.reward_head = nn.Linear(hidden_dim, 1)

    def forward(self, hidden_state: torch.Tensor, action: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        action_emb = self.action_embed(action)
        x = torch.cat([hidden_state, action_emb], dim=-1)
        x = F.relu(self.fc1(x))
        next_hidden = torch.tanh(self.fc2(x))
        reward = torch.tanh(self.reward_head(x))
        return next_hidden, reward


class PredictionNet(nn.Module):
    def __init__(self, latent_dim: int, hidden_dim: int, action_dim: int) -> None:
        super().__init__()
        self.fc1 = nn.Linear(latent_dim, hidden_dim)
        self.policy_head = nn.Linear(hidden_dim, action_dim)
        self.value_head = nn.Linear(hidden_dim, 1)

    def forward(self, hidden_state: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        x = F.relu(self.fc1(hidden_state))
        policy_logits = self.policy_head(x)
        value = torch.tanh(self.value_head(x))
        return policy_logits, value


class MuZeroNetwork(nn.Module):
    """Container for representation, dynamics, and prediction functions."""

    def __init__(self, config: Dict) -> None:
        super().__init__()
        net_conf = config.get("network", {})
        env_conf = config.get("environment", {})
        observation_dim = int(net_conf.get("observation_dim", 27))
        hidden_dim = int(net_conf.get("hidden_dim", 64))
        latent_dim = int(net_conf.get("latent_dim", 48))
        action_dim = int(env_conf.get("job_pool_size", 5))
        self.representation = RepresentationNet(observation_dim, latent_dim, hidden_dim)
        self.dynamics = DynamicsNet(latent_dim, action_dim, hidden_dim)
        self.prediction = PredictionNet(latent_dim, hidden_dim, action_dim)
        self.action_dim = action_dim

    def initial_inference(self, observation: torch.Tensor) -> MuZeroNetworkOutput:
        if observation.dim() == 1:
            observation = observation.unsqueeze(0)
        hidden_state = self.representation(observation)
        policy_logits, value = self.prediction(hidden_state)
        reward = torch.zeros_like(value)
        return MuZeroNetworkOutput(policy_logits, value, reward, hidden_state)

    def recurrent_inference(self, hidden_state: torch.Tensor, action: torch.Tensor) -> MuZeroNetworkOutput:
        if hidden_state.dim() == 1:
            hidden_state = hidden_state.unsqueeze(0)
        next_hidden, reward = self.dynamics(hidden_state, action)
        policy_logits, value = self.prediction(next_hidden)
        return MuZeroNetworkOutput(policy_logits, value, reward, next_hidden)

    def support_to_scalar(self, tensor: torch.Tensor) -> torch.Tensor:
        return tensor

    def scalar_to_support(self, scalar: torch.Tensor) -> torch.Tensor:
        return scalar
