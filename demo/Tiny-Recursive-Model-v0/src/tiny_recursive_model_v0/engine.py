"""Tiny Recursive Model engine implementation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from .config import TrmConfig
from .utils import set_global_seed, softmax


class TinyRecursiveNetwork(nn.Module):
    """Two-layer network with recursive improvement and halting."""

    def __init__(
        self,
        input_dim: int,
        latent_dim: int,
        hidden_dim: int,
        output_dim: int,
    ) -> None:
        super().__init__()
        self.latent_dim = latent_dim
        self.output_dim = output_dim
        self.state_cell = nn.GRUCell(input_dim + output_dim, latent_dim)
        self.answer_head = nn.Sequential(
            nn.Linear(latent_dim + output_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, output_dim),
        )
        halt_hidden = max(4, hidden_dim // 2)
        self.halt_head = nn.Sequential(
            nn.Linear(latent_dim + output_dim, halt_hidden),
            nn.ReLU(),
            nn.Linear(halt_hidden, 2),
        )

    def step(
        self,
        inputs: torch.Tensor,
        state: torch.Tensor,
        answer_context: torch.Tensor,
        inner_cycles: int,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """Execute one outer step returning updated state and logits."""

        for _ in range(inner_cycles):
            gru_input = torch.cat([inputs, answer_context], dim=-1)
            state = self.state_cell(gru_input, state)
        joint = torch.cat([state, answer_context], dim=-1)
        logits = self.answer_head(joint)
        answer_context = torch.tanh(logits)
        halt_logit = self.halt_head(joint)
        return state, answer_context, logits, halt_logit

    def forward(
        self,
        inputs: torch.Tensor,
        inner_cycles: int,
        outer_steps: int,
    ) -> tuple[List[torch.Tensor], List[torch.Tensor]]:
        batch_size = inputs.size(0)
        device = inputs.device
        state = torch.zeros(batch_size, self.latent_dim, device=device)
        answer_context = torch.zeros(batch_size, self.output_dim, device=device)
        answer_logits: List[torch.Tensor] = []
        halt_logits: List[torch.Tensor] = []

        for _ in range(outer_steps):
            state, answer_context, logits, halt_logit = self.step(
                inputs,
                state,
                answer_context,
                inner_cycles,
            )
            answer_logits.append(logits)
            halt_logits.append(halt_logit)
        return answer_logits, halt_logits


@dataclass
class TrainingMetrics:
    loss: float
    accuracy: float


@dataclass
class TrainingReport:
    epochs: int
    metrics: List[TrainingMetrics]


@dataclass
class InferenceTelemetry:
    steps_used: int
    cycles_used: int
    halted_early: bool
    halt_probabilities: List[float]
    logits: torch.Tensor
    probabilities: torch.Tensor


class TinyRecursiveModelEngine:
    """High-level TRM engine with training, inference, and EMA."""

    def __init__(
        self,
        config: TrmConfig,
        *,
        inner_cycles: Optional[int] = None,
        outer_steps: Optional[int] = None,
        halt_threshold: Optional[float] = None,
        device: Optional[str] = None,
    ) -> None:
        self.config = config
        self.inner_cycles = inner_cycles or config.inner_cycles
        self.outer_steps = outer_steps or config.outer_steps
        self.halt_threshold = halt_threshold or config.halt_threshold
        self.max_cycles = config.max_cycles
        self.device = torch.device(device or config.device)
        self.model = TinyRecursiveNetwork(
            config.input_dim,
            config.latent_dim,
            config.hidden_dim,
            config.output_dim,
        ).to(self.device)
        self.ema_model = TinyRecursiveNetwork(
            config.input_dim,
            config.latent_dim,
            config.hidden_dim,
            config.output_dim,
        ).to(self.device)
        self.ema_model.load_state_dict(self.model.state_dict())
        self.ema_decay = config.ema_decay

    @classmethod
    def from_config(cls, config: TrmConfig, *, device: Optional[str] = None) -> "TinyRecursiveModelEngine":
        return cls(config, device=device)

    def _update_ema(self) -> None:
        with torch.no_grad():
            for ema_param, param in zip(self.ema_model.parameters(), self.model.parameters()):
                ema_param.data.mul_(self.ema_decay).add_(param.data, alpha=1 - self.ema_decay)

    def train(
        self,
        features: torch.Tensor,
        labels: torch.Tensor,
        *,
        epochs: Optional[int] = None,
        batch_size: Optional[int] = None,
        seed: int = 7,
    ) -> TrainingReport:
        self.model.train()
        set_global_seed(seed)
        epochs = epochs or self.config.epochs
        batch_size = batch_size or self.config.batch_size
        dataset = TensorDataset(features, labels)
        loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
        optimizer = torch.optim.AdamW(
            self.model.parameters(),
            lr=self.config.learning_rate,
            weight_decay=self.config.weight_decay,
        )
        loss_fn = nn.CrossEntropyLoss()
        halt_loss_fn = nn.CrossEntropyLoss()
        metrics: List[TrainingMetrics] = []

        for _ in range(epochs):
            running_loss = 0.0
            correct = 0
            total = 0
            for batch_features, batch_labels in loader:
                batch_features = batch_features.to(self.device)
                batch_labels = batch_labels.to(self.device)
                optimizer.zero_grad(set_to_none=True)
                answer_logits, halt_logits = self.model(
                    batch_features,
                    self.inner_cycles,
                    self.outer_steps,
                )
                deep_supervision_loss = 0.0
                for logits in answer_logits:
                    deep_supervision_loss = deep_supervision_loss + loss_fn(logits, batch_labels)
                deep_supervision_loss = deep_supervision_loss / len(answer_logits)
                halt_targets = torch.zeros(batch_features.size(0), len(halt_logits), dtype=torch.long, device=self.device)
                halt_targets[:, -1] = 1
                halt_logits_tensor = torch.stack(halt_logits, dim=1)
                halt_loss = halt_loss_fn(
                    halt_logits_tensor.view(-1, halt_logits_tensor.size(-1)),
                    halt_targets.view(-1),
                )
                loss = deep_supervision_loss + 0.2 * halt_loss
                loss.backward()
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                optimizer.step()
                self._update_ema()

                running_loss += loss.item() * batch_features.size(0)
                final_logits = answer_logits[-1]
                predictions = final_logits.argmax(dim=-1)
                correct += (predictions == batch_labels).sum().item()
                total += batch_features.size(0)
            metrics.append(
                TrainingMetrics(
                    loss=running_loss / total,
                    accuracy=correct / total if total else 0.0,
                )
            )
        return TrainingReport(epochs=epochs, metrics=metrics)

    def _predict_with_model(
        self,
        model: TinyRecursiveNetwork,
        inputs: torch.Tensor,
        *,
        halt_threshold: Optional[float] = None,
    ) -> InferenceTelemetry:
        model.eval()
        halt_threshold = halt_threshold or self.halt_threshold
        with torch.no_grad():
            answer_logits: List[torch.Tensor] = []
            halt_logits: List[torch.Tensor] = []
            batch_size = inputs.size(0)
            state = torch.zeros(batch_size, model.latent_dim, device=inputs.device)
            answer_context = torch.zeros(batch_size, model.output_dim, device=inputs.device)
            cycles_used = 0
            halted_step = self.outer_steps
            for step in range(self.outer_steps):
                state, answer_context, logits, halt_logit = model.step(
                    inputs,
                    state,
                    answer_context,
                    self.inner_cycles,
                )
                cycles_used += self.inner_cycles
                answer_logits.append(logits)
                halt_logits.append(halt_logit)
                halt_prob = softmax(halt_logit)[..., 1]
                if halt_prob.mean().item() >= halt_threshold or cycles_used >= self.max_cycles:
                    halted_step = step + 1
                    break
            final_logits = answer_logits[-1]
            probabilities = softmax(final_logits)
            halt_probabilities = [softmax(logit)[..., 1].mean().item() for logit in halt_logits]
            return InferenceTelemetry(
                steps_used=halted_step,
                cycles_used=cycles_used,
                halted_early=halted_step < self.outer_steps,
                halt_probabilities=halt_probabilities,
                logits=final_logits,
                probabilities=probabilities,
            )

    def infer(
        self,
        inputs: torch.Tensor,
        *,
        halt_threshold: Optional[float] = None,
        use_ema: bool = True,
    ) -> InferenceTelemetry:
        model = self.ema_model if use_ema else self.model
        return self._predict_with_model(model, inputs.to(self.device), halt_threshold=halt_threshold)

    def save(self, path: str) -> None:
        torch.save({"model": self.model.state_dict(), "ema": self.ema_model.state_dict()}, path)

    def load(self, path: str) -> None:
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint["model"])
        self.ema_model.load_state_dict(checkpoint["ema"])


__all__ = [
    "InferenceTelemetry",
    "TinyRecursiveModelEngine",
    "TinyRecursiveNetwork",
    "TrainingMetrics",
    "TrainingReport",
]
