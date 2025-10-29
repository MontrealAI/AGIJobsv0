"""Tiny Recursive Model engine implementation."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Sequence, Tuple, Union

import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset, TensorDataset

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
        self.primary_cell = nn.GRUCell(input_dim + output_dim, latent_dim)
        self.refine_cell = nn.GRUCell(latent_dim + output_dim, latent_dim)
        joint_dim = latent_dim * 2 + output_dim
        self.answer_head = nn.Sequential(
            nn.Linear(joint_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, output_dim),
        )
        halt_hidden = max(4, hidden_dim // 2)
        self.halt_head = nn.Sequential(
            nn.Linear(joint_dim, halt_hidden),
            nn.ReLU(),
            nn.Linear(halt_hidden, 2),
        )

    def step(
        self,
        inputs: torch.Tensor,
        primary_state: torch.Tensor,
        refine_state: torch.Tensor,
        answer_context: torch.Tensor,
        inner_cycles: int,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """Execute one outer step returning updated state and logits."""

        for _ in range(inner_cycles):
            gru_input = torch.cat([inputs, answer_context], dim=-1)
            next_primary = self.primary_cell(gru_input, primary_state)
            refine_input = torch.cat([next_primary, answer_context], dim=-1)
            next_refine = self.refine_cell(refine_input, refine_state)
            primary_state, refine_state = next_primary, next_refine
        joint = torch.cat([primary_state, refine_state, answer_context], dim=-1)
        logits = self.answer_head(joint)
        answer_context = torch.tanh(logits)
        halt_logit = self.halt_head(joint)
        return primary_state, refine_state, answer_context, logits, halt_logit

    def forward(
        self,
        inputs: torch.Tensor,
        inner_cycles: int,
        outer_steps: int,
    ) -> Tuple[List[torch.Tensor], List[torch.Tensor]]:
        batch_size = inputs.size(0)
        device = inputs.device
        primary_state = torch.zeros(batch_size, self.latent_dim, device=device)
        refine_state = torch.zeros_like(primary_state)
        answer_context = torch.zeros(batch_size, self.output_dim, device=device)
        answer_logits: List[torch.Tensor] = []
        halt_logits: List[torch.Tensor] = []

        for _ in range(outer_steps):
            primary_state, refine_state, answer_context, logits, halt_logit = self.step(
                inputs,
                primary_state,
                refine_state,
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
        dims = config.model
        recursion = config.recursion
        roi = config.roi
        runtime_device = device or config.device
        self.inner_cycles = inner_cycles or recursion.inner_cycles
        self.outer_steps = outer_steps or recursion.outer_steps
        self.halt_threshold = halt_threshold or roi.halt_threshold
        self.max_cycles = recursion.max_cycles
        self.device = torch.device(runtime_device)
        self.model = TinyRecursiveNetwork(
            dims.input_dim,
            dims.latent_dim,
            dims.hidden_dim,
            dims.output_dim,
        ).to(self.device)
        self.ema_model = TinyRecursiveNetwork(
            dims.input_dim,
            dims.latent_dim,
            dims.hidden_dim,
            dims.output_dim,
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
        features: Optional[torch.Tensor] = None,
        labels: Optional[torch.Tensor] = None,
        *,
        dataset: Optional[Dataset[Tuple[torch.Tensor, torch.Tensor]]] = None,
        loader: Optional[DataLoader[Tuple[torch.Tensor, torch.Tensor]]] = None,
        epochs: Optional[int] = None,
        batch_size: Optional[int] = None,
        seed: int = 7,
        shuffle: bool = True,
    ) -> TrainingReport:
        """Train the recursive model on tensors, datasets, or loaders."""

        if loader is not None and any(arg is not None for arg in (dataset, features, labels)):
            raise ValueError("Provide either a DataLoader or tensors/dataset, not both.")
        if dataset is not None and any(arg is not None for arg in (features, labels)):
            raise ValueError("Provide either features/labels or a dataset, not both.")
        if loader is None:
            if dataset is None:
                if features is None or labels is None:
                    raise ValueError("Features and labels are required when no dataset/loader is supplied.")
                dataset = TensorDataset(features, labels)
            loader = DataLoader(
                dataset,
                batch_size=batch_size or self.config.training.batch_size,
                shuffle=shuffle,
            )

        self.model.train()
        set_global_seed(seed)
        epochs = epochs or self.config.training.epochs
        optimizer = torch.optim.AdamW(
            self.model.parameters(),
            lr=self.config.optimizer.learning_rate,
            weight_decay=self.config.optimizer.weight_decay,
        )
        loss_fn = nn.CrossEntropyLoss()
        halt_loss_fn = nn.CrossEntropyLoss()
        metrics: List[TrainingMetrics] = []

        for _ in range(epochs):
            running_loss = 0.0
            correct = 0
            total = 0
            for batch in loader:
                if isinstance(batch, dict):
                    batch_features = batch.get("features") or batch.get("inputs")
                    batch_labels = batch.get("labels")
                else:
                    batch_features, batch_labels = batch  # type: ignore[misc]
                if batch_features is None or batch_labels is None:
                    raise ValueError("Training batches must provide features and labels.")
                batch_features = batch_features.to(self.device)
                batch_labels = batch_labels.to(self.device)
                optimizer.zero_grad(set_to_none=True)
                answer_logits, halt_logits = self.model(
                    batch_features,
                    self.inner_cycles,
                    self.outer_steps,
                )
                deep_supervision_loss = torch.stack(
                    [loss_fn(logits, batch_labels) for logits in answer_logits]
                ).mean()
                halt_steps = len(halt_logits)
                halt_targets = torch.zeros(
                    batch_features.size(0),
                    halt_steps,
                    dtype=torch.long,
                    device=self.device,
                )
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
            batch_size = inputs.size(0)
            device = inputs.device
            primary_state = torch.zeros(batch_size, model.latent_dim, device=device)
            refine_state = torch.zeros_like(primary_state)
            answer_context = torch.zeros(batch_size, model.output_dim, device=device)
            final_logits = torch.zeros(batch_size, model.output_dim, device=device)
            halted_mask = torch.zeros(batch_size, dtype=torch.bool, device=device)
            halt_probabilities: List[float] = []
            cycles_used = 0
            steps_used = 0
            for step in range(self.outer_steps):
                prev_primary = primary_state
                prev_refine = refine_state
                prev_answer = answer_context
                primary_state, refine_state, answer_context_step, logits, halt_logit = model.step(
                    inputs,
                    primary_state,
                    refine_state,
                    answer_context,
                    self.inner_cycles,
                )
                cycles_used = min(self.max_cycles, cycles_used + self.inner_cycles)
                active_mask = (~halted_mask).unsqueeze(-1)
                primary_state = torch.where(active_mask, primary_state, prev_primary)
                refine_state = torch.where(active_mask, refine_state, prev_refine)
                answer_context = torch.where(active_mask, answer_context_step, prev_answer)
                final_logits = torch.where(active_mask, logits, final_logits)
                halt_prob = softmax(halt_logit)[..., 1]
                halt_probabilities.append(halt_prob.mean().item())
                newly_halted = (~halted_mask) & (halt_prob >= halt_threshold)
                halted_mask = halted_mask | newly_halted
                steps_used = step + 1
                if halted_mask.all() or cycles_used >= self.max_cycles:
                    break
            probabilities = softmax(final_logits)
            return InferenceTelemetry(
                steps_used=steps_used,
                cycles_used=cycles_used,
                halted_early=steps_used < self.outer_steps and halted_mask.any().item(),
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

    def infer_dataset(
        self,
        data: Union[torch.Tensor, Dataset[torch.Tensor], DataLoader[torch.Tensor]],
        *,
        halt_threshold: Optional[float] = None,
        use_ema: bool = True,
        batch_size: Optional[int] = None,
    ) -> List[InferenceTelemetry]:
        """Run inference over tensors, datasets, or dataloaders."""

        if isinstance(data, torch.Tensor):
            return [self.infer(data, halt_threshold=halt_threshold, use_ema=use_ema)]
        if isinstance(data, DataLoader):
            loader: DataLoader = data
        else:
            loader = DataLoader(
                data,
                batch_size=batch_size or self.config.training.batch_size,
                shuffle=False,
            )
        telemetry: List[InferenceTelemetry] = []
        for batch in loader:
            if isinstance(batch, dict):
                features = batch.get("features") or batch.get("inputs")
            elif isinstance(batch, Sequence):
                features = batch[0]
            else:
                features = batch
            if features is None:
                raise ValueError("Inference batches must include feature tensors.")
            telemetry.append(
                self.infer(features, halt_threshold=halt_threshold, use_ema=use_ema)
            )
        return telemetry

    def save(self, path: str) -> None:
        torch.save({"model": self.model.state_dict(), "ema": self.ema_model.state_dict()}, path)

    def load(self, path: str) -> None:
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint["model"])
        self.ema_model.load_state_dict(checkpoint["ema"])


ConfigSource = Union[TrmConfig, str, Path]


def _coerce_config(config: ConfigSource) -> TrmConfig:
    return config if isinstance(config, TrmConfig) else TrmConfig.load(config)


def run_training_cycle(
    config: ConfigSource,
    *,
    features: Optional[torch.Tensor] = None,
    labels: Optional[torch.Tensor] = None,
    dataset: Optional[Dataset[Tuple[torch.Tensor, torch.Tensor]]] = None,
    loader: Optional[DataLoader[Tuple[torch.Tensor, torch.Tensor]]] = None,
    device: Optional[str] = None,
    **train_kwargs,
) -> Tuple[TinyRecursiveModelEngine, TrainingReport]:
    """Convenience helper to instantiate and train from config or YAML path."""

    config_obj = _coerce_config(config)
    engine = TinyRecursiveModelEngine.from_config(config_obj, device=device)
    report = engine.train(
        features=features,
        labels=labels,
        dataset=dataset,
        loader=loader,
        **train_kwargs,
    )
    return engine, report


EngineSource = Union[TinyRecursiveModelEngine, ConfigSource]


def run_inference_cycle(
    engine_or_config: EngineSource,
    data: Union[torch.Tensor, Dataset[torch.Tensor], DataLoader[torch.Tensor]],
    *,
    device: Optional[str] = None,
    halt_threshold: Optional[float] = None,
    use_ema: bool = True,
    batch_size: Optional[int] = None,
) -> Tuple[TinyRecursiveModelEngine, List[InferenceTelemetry]]:
    """Instantiate (if needed) and run inference over the provided data."""

    if isinstance(engine_or_config, TinyRecursiveModelEngine):
        engine = engine_or_config
    else:
        config_obj = _coerce_config(engine_or_config)
        engine = TinyRecursiveModelEngine.from_config(config_obj, device=device)
    telemetry = engine.infer_dataset(
        data,
        halt_threshold=halt_threshold,
        use_ema=use_ema,
        batch_size=batch_size,
    )
    return engine, telemetry


__all__ = [
    "InferenceTelemetry",
    "run_inference_cycle",
    "run_training_cycle",
    "TinyRecursiveModelEngine",
    "TinyRecursiveNetwork",
    "TrainingMetrics",
    "TrainingReport",
]
