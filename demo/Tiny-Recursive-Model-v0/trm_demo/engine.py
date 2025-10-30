"""Implementation of the Tiny Recursive Model (TRM) used throughout the demo."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

import torch
from torch import Tensor, nn
from torch.nn import functional as F
from torch.utils.data import DataLoader

from .config import TinyRecursiveModelConfig


@dataclass(slots=True)
class TRMInferenceResult:
    """Container with rich inference metadata for auditability."""

    logits: Tensor
    probabilities: Tensor
    predicted_class: Tensor
    steps_used: int
    halted_early: bool
    halt_probabilities: List[float]


class _ResidualBlock(nn.Module):
    """Simple residual MLP block used by the recursive updates."""

    def __init__(self, in_dim: int, hidden_dim: int, out_dim: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.LayerNorm(in_dim),
            nn.Linear(in_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, out_dim),
        )
        self.proj = nn.Linear(in_dim, out_dim) if in_dim != out_dim else nn.Identity()

    def forward(self, x: Tensor) -> Tensor:  # noqa: D401 - simple wrapper
        residual = self.proj(x)
        return self.net(x) + residual


class TinyRecursiveModel(nn.Module):
    """Tiny two-layer recursive reasoning network with adaptive halting."""

    def __init__(self, config: TinyRecursiveModelConfig) -> None:
        super().__init__()
        concat_dim = config.input_dim + config.latent_dim + config.answer_dim
        self.state_update = _ResidualBlock(concat_dim, config.hidden_dim, config.latent_dim)
        self.answer_update = _ResidualBlock(concat_dim, config.hidden_dim, config.answer_dim)
        self.output_head = nn.Sequential(
            nn.LayerNorm(config.answer_dim),
            nn.Linear(config.answer_dim, config.hidden_dim),
            nn.GELU(),
            nn.Linear(config.hidden_dim, config.num_classes),
        )
        self.halt_head = nn.Sequential(
            nn.LayerNorm(config.latent_dim),
            nn.Linear(config.latent_dim, config.hidden_dim // 2),
            nn.Tanh(),
            nn.Linear(config.hidden_dim // 2, 1),
        )
        self.config = config

    def _initial_state(self, batch_size: int, device: torch.device) -> Tuple[Tensor, Tensor]:
        return (
            torch.zeros(batch_size, self.config.latent_dim, device=device),
            torch.zeros(batch_size, self.config.answer_dim, device=device),
        )

    def forward(  # noqa: D401
        self,
        inputs: Tensor,
        halt_threshold: float,
        supervise: bool = False,
    ) -> Dict[str, Tensor | List[Tensor]]:
        """Run the recursive refinement process.

        Args:
            inputs: Input tensor of shape ``[batch, input_dim]``.
            halt_threshold: Probability threshold used to decide when to halt.
            supervise: When ``True`` the model always performs the maximum number
                of cycles so that training loss can be computed at each step.

        Returns:
            Dictionary containing the final logits, intermediate logits and
            halting probabilities for downstream processing.
        """

        batch_size = inputs.size(0)
        device = inputs.device
        latent, answer = self._initial_state(batch_size, device)
        max_steps = self.config.total_possible_steps
        halt_threshold = float(halt_threshold)

        logits_per_step: List[Tensor] = []
        halt_logits: List[Tensor] = []
        halting_mask = torch.zeros(batch_size, dtype=torch.bool, device=device)
        steps_executed = torch.zeros(batch_size, dtype=torch.int32, device=device)

        step_counter = 0
        for outer in range(self.config.outer_steps):
            for inner in range(self.config.inner_cycles):
                if step_counter >= max_steps:
                    break
                concat = torch.cat([inputs, latent, answer], dim=-1)
                latent = latent + self.state_update(concat)
                halt_logit = self.halt_head(latent).squeeze(-1)
                halt_logits.append(halt_logit)
                halt_prob = torch.sigmoid(halt_logit)
                newly_halted = (halt_prob >= halt_threshold) & (~halting_mask)
                halting_mask = halting_mask | newly_halted
                steps_executed[~halting_mask] += 1
                step_counter += 1
                if not supervise and bool(halting_mask.all()):
                    break
            concat = torch.cat([inputs, latent, answer], dim=-1)
            answer = answer + self.answer_update(concat)
            logits_per_step.append(self.output_head(answer))
            if not supervise and bool(halting_mask.all()):
                break

        final_logits = logits_per_step[-1]
        halt_probs = [torch.sigmoid(logit) for logit in halt_logits]
        return {
            "final_logits": final_logits,
            "logits_per_step": logits_per_step,
            "halt_logits": halt_logits,
            "halt_probabilities": halt_probs,
            "steps_executed": steps_executed,
            "max_steps": torch.tensor(step_counter, device=device),
        }


class TRMEngine:
    """High-level orchestration wrapper around :class:`TinyRecursiveModel`."""

    def __init__(self, config: TinyRecursiveModelConfig) -> None:
        self.config = config
        self.device = torch.device(config.device)
        self.model = TinyRecursiveModel(config).to(self.device)
        self.ema_model = copy.deepcopy(self.model)
        for param in self.ema_model.parameters():
            param.requires_grad_(False)

    def _update_ema(self) -> None:
        with torch.no_grad():
            for ema_param, param in zip(self.ema_model.parameters(), self.model.parameters(), strict=True):
                ema_param.mul_(self.config.ema_decay).add_(param, alpha=1.0 - self.config.ema_decay)

    def parameters(self) -> Iterable[nn.Parameter]:  # pragma: no cover - thin wrapper
        return self.model.parameters()

    def train_model(
        self,
        dataset: torch.utils.data.Dataset,
        *,
        halt_targets: Optional[Tensor] = None,
        epochs: Optional[int] = None,
        batch_size: Optional[int] = None,
        progress_callback: Optional[callable] = None,
    ) -> None:
        """Train the model with deep supervision over recursive steps."""

        cfg = self.config
        epochs = epochs or cfg.epochs
        batch_size = batch_size or cfg.batch_size
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True, drop_last=False)
        optimiser = torch.optim.AdamW(self.model.parameters(), lr=cfg.learning_rate, weight_decay=cfg.weight_decay)

        supervision_weights = cfg.resolved_supervision_weights()
        halt_loss_weight = 0.1
        total_steps = cfg.total_possible_steps

        for epoch in range(epochs):
            epoch_loss = 0.0
            for batch_idx, batch in enumerate(dataloader):
                inputs = batch["features"].to(self.device)
                labels = batch["label"].to(self.device)
                batch_halt_targets = batch.get("halt_target")
                if batch_halt_targets is not None:
                    halt_targets_batch = batch_halt_targets.to(self.device)
                elif halt_targets is not None:
                    halt_targets_batch = halt_targets.to(self.device)
                else:
                    halt_targets_batch = torch.full((inputs.size(0),), total_steps - 1, device=self.device, dtype=torch.long)

                outputs = self.model(inputs, cfg.halt_threshold, supervise=True)
                logits_per_step: List[Tensor] = outputs["logits_per_step"]  # type: ignore[assignment]
                halt_logits: List[Tensor] = outputs["halt_logits"]  # type: ignore[assignment]

                classification_loss = 0.0
                for step_idx, logits in enumerate(logits_per_step):
                    weight = supervision_weights[min(step_idx, len(supervision_weights) - 1)]
                    classification_loss = classification_loss + weight * F.cross_entropy(logits, labels)

                halt_target_matrix = F.one_hot(halt_targets_batch, num_classes=total_steps).float()
                stacked_halt_logits = torch.stack(halt_logits, dim=1)
                halt_probs = torch.sigmoid(stacked_halt_logits)
                halt_loss = F.binary_cross_entropy(halt_probs, halt_target_matrix[:, : halt_probs.size(1)])

                loss = classification_loss + halt_loss_weight * halt_loss
                optimiser.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                optimiser.step()
                self._update_ema()
                epoch_loss += float(loss.item())

            if progress_callback is not None:
                progress_callback(epoch + 1, epochs, epoch_loss / max(1, batch_idx + 1))

    @torch.inference_mode()
    def infer(
        self,
        inputs: Tensor,
        *,
        use_ema: bool = True,
        halt_threshold: Optional[float] = None,
        max_steps: Optional[int] = None,
    ) -> TRMInferenceResult:
        """Run inference with adaptive halting and rich telemetry."""

        model = self.ema_model if use_ema else self.model
        model.eval()
        threshold = halt_threshold or self.config.halt_threshold
        outputs = model(inputs.to(self.device), threshold, supervise=False)
        logits = outputs["final_logits"]
        probabilities = F.softmax(logits, dim=-1)
        predicted_class = torch.argmax(probabilities, dim=-1)
        steps_executed_tensor: Tensor = outputs["steps_executed"]  # type: ignore[assignment]
        steps_used = int(torch.max(steps_executed_tensor).item())
        halt_probs: List[Tensor] = outputs["halt_probabilities"]  # type: ignore[assignment]
        halting_values = [float(prob.mean().item()) for prob in halt_probs]
        halted_early = steps_used < (max_steps or self.config.total_possible_steps)
        if max_steps is not None:
            steps_used = min(steps_used, max_steps)
        return TRMInferenceResult(
            logits=logits.detach().cpu(),
            probabilities=probabilities.detach().cpu(),
            predicted_class=predicted_class.detach().cpu(),
            steps_used=steps_used,
            halted_early=halted_early,
            halt_probabilities=halting_values,
        )

    def update_hyperparameters(
        self,
        *,
        halt_threshold: Optional[float] = None,
        inner_cycles: Optional[int] = None,
        outer_steps: Optional[int] = None,
    ) -> None:
        """Update runtime hyperparameters in-place (used by thermostat)."""

        if halt_threshold is not None:
            self.config.halt_threshold = float(halt_threshold)
        if inner_cycles is not None:
            self.config.inner_cycles = int(inner_cycles)
        if outer_steps is not None:
            self.config.outer_steps = int(outer_steps)

    def export_model_state(self) -> Dict[str, torch.Tensor]:
        """Return a serialisable snapshot of the EMA model for deployment."""

        return {
            "config": torch.tensor(
                [
                    self.config.input_dim,
                    self.config.latent_dim,
                    self.config.answer_dim,
                    self.config.hidden_dim,
                    self.config.num_classes,
                    self.config.inner_cycles,
                    self.config.outer_steps,
                ],
                dtype=torch.float32,
            ),
            "state_dict": self.ema_model.state_dict(),
        }

