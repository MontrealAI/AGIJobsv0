"""Training pipeline for MuZero demo."""
from __future__ import annotations

from typing import Dict, Iterable, List, Tuple

import torch
import torch.optim as optim

from .environment import JobsEnvironment
from .planner import MuZeroPlanner
from .replay import ReplayBuffer, Transition
from .telemetry import TelemetrySink


def discount_returns(rewards: List[float], discount: float) -> List[float]:
    returns = []
    running = 0.0
    for reward in reversed(rewards):
        running = reward + discount * running
        returns.insert(0, running)
    return returns


class MuZeroTrainer:
    def __init__(self, config: Dict, network: torch.nn.Module, device: torch.device) -> None:
        self.config = config
        train_conf = config.get("training", {})
        self.batch_size = int(train_conf.get("batch_size", 32))
        self.unroll_steps = int(train_conf.get("unroll_steps", 5))
        self.td_steps = int(train_conf.get("td_steps", 5))
        self.learning_rate = float(train_conf.get("learning_rate", 8e-4))
        self.weight_decay = float(train_conf.get("weight_decay", 1e-6))
        self.reanalyse_ratio = float(train_conf.get("reanalyse_ratio", 0.25))
        self.value_weight = float(train_conf.get("value_loss_weight", 1.0))
        self.reward_weight = float(train_conf.get("reward_loss_weight", 1.0))
        self.policy_weight = float(train_conf.get("policy_loss_weight", 1.0))
        self.checkpoint_interval = int(train_conf.get("checkpoint_interval", 16))
        replay_capacity = int(train_conf.get("replay_capacity", 2048))
        self.replay = ReplayBuffer(replay_capacity)
        self.network = network
        self.device = device
        self.telemetry = TelemetrySink(config)
        self.optimizer = optim.Adam(self.network.parameters(), lr=self.learning_rate, weight_decay=self.weight_decay)
        self.discount = float(config.get("environment", {}).get("discount", 0.997))

    def self_play(self, env: JobsEnvironment, planner: MuZeroPlanner, episodes: int) -> None:
        for episode in range(episodes):
            planner.reset_episode()
            env.reset()
            observation = env.observe()
            episode_transitions: List[Transition] = []
            accumulated_return = 0.0
            discount_power = 1.0
            while not env.done:
                action, policy, meta = planner.plan(env, observation)
                next_obs, reward, done, info = env.step(action)
                accumulated_return += reward * discount_power
                discount_power *= self.discount
                transition = Transition(observation=list(observation), action=action, reward=reward, policy=policy, value=meta["expected_value"])
                episode_transitions.append(transition)
                planner.observe_outcome(meta["expected_value"], reward)
                observation = next_obs
            self.replay.extend_episode(episode_transitions)
            if len(self.replay) >= self.batch_size:
                for _ in range(3):
                    self.train_step()
            self.telemetry.record("self_play_episode", {"episode": episode, "return": accumulated_return})

    def train_step(self) -> Dict[str, float]:
        if len(self.replay) == 0:
            return {"loss": 0.0}
        batch = self.replay.sample(self.batch_size)
        observations = torch.tensor([t.observation for t in batch], dtype=torch.float32, device=self.device)
        actions = torch.tensor([t.action for t in batch], dtype=torch.long, device=self.device)
        rewards = torch.tensor([t.reward for t in batch], dtype=torch.float32, device=self.device).unsqueeze(-1)
        target_policies = torch.tensor([t.policy for t in batch], dtype=torch.float32, device=self.device)
        target_values = torch.tensor([t.value for t in batch], dtype=torch.float32, device=self.device).unsqueeze(-1)

        outputs = self.network.initial_inference(observations)
        policy_loss = torch.nn.functional.cross_entropy(outputs.policy_logits, torch.argmax(target_policies, dim=-1))
        value_loss = torch.nn.functional.mse_loss(outputs.value, target_values)
        reward_loss = torch.nn.functional.mse_loss(outputs.reward, rewards)
        loss = self.policy_weight * policy_loss + self.value_weight * value_loss + self.reward_weight * reward_loss
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.network.parameters(), max_norm=5.0)
        self.optimizer.step()
        metrics = {
            "loss": float(loss.item()),
            "policy_loss": float(policy_loss.item()),
            "value_loss": float(value_loss.item()),
            "reward_loss": float(reward_loss.item()),
        }
        self.telemetry.record("training_step", metrics)
        return metrics

    def save_checkpoint(self, path: str) -> None:
        torch.save(self.network.state_dict(), path)
