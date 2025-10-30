"""High-level orchestration of the Tiny Recursive Model demo."""
from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Optional

import torch
from torch import Tensor, nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, random_split

from .config import DemoSettings
from .dataset import OperationSequenceDataset
from .models import TinyRecursiveModel


@dataclass
class InferenceResult:
    prediction: int
    confidence: float
    halted_early: bool
    steps_used: int
    latency_ms: float
    logits: Tensor


@dataclass
class TrainingReport:
    epochs_run: int
    train_loss: float
    val_loss: float
    best_checkpoint: Path


class TrmEngine:
    """Manage the lifecycle of the Tiny Recursive Model."""

    def __init__(self, settings: DemoSettings) -> None:
        self.settings = settings
        self.base_dir = Path(__file__).resolve().parent.parent
        self.model = TinyRecursiveModel(
            input_dim=settings.trm.input_dim,
            latent_dim=settings.trm.latent_dim,
            answer_dim=settings.trm.answer_dim,
            model_type=settings.trm.model_type,
            dropout=settings.trm.dropout,
            weight_init_scale=settings.trm.weight_init_scale,
        )
        self.device = torch.device(settings.trm.device)
        self.model.to(self.device)
        self.ema_decay = settings.trm.ema_decay
        self.ema_state: Dict[str, Tensor] = {
            k: v.clone().detach() for k, v in self.model.state_dict().items()
        }

    def _resolve_path(self, path: str | Path) -> Path:
        candidate = Path(path)
        if candidate.is_absolute():
            return candidate
        return (self.base_dir / candidate).resolve()

    def _update_ema(self) -> None:
        for key, param in self.model.state_dict().items():
            self.ema_state[key].mul_(self.ema_decay)
            self.ema_state[key].add_(param.detach() * (1 - self.ema_decay))

    def _load_ema(self) -> Dict[str, Tensor]:
        return {k: v.clone() for k, v in self.ema_state.items()}

    def save_checkpoint(self, path: str | Path) -> Path:
        path = self._resolve_path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        torch.save({"model": self.model.state_dict(), "ema": self.ema_state}, path)
        return path

    def load_checkpoint(self, path: str | Path, *, use_ema: bool = True) -> None:
        checkpoint = torch.load(self._resolve_path(path), map_location=self.device)
        state = checkpoint["ema"] if use_ema and "ema" in checkpoint else checkpoint["model"]
        self.model.load_state_dict(state)
        if "ema" in checkpoint:
            self.ema_state = {k: v.clone() for k, v in checkpoint["ema"].items()}

    def infer(
        self,
        sample: Dict[str, Tensor],
        *,
        max_outer_steps: Optional[int] = None,
        max_inner_steps: Optional[int] = None,
        halt_threshold: Optional[float] = None,
        use_ema: bool = True,
    ) -> InferenceResult:
        """Run inference on a single sample."""
        if use_ema:
            ema_weights = self._load_ema()
            self.model.load_state_dict(ema_weights, strict=False)
        self.model.eval()
        with torch.no_grad():
            start_time = time.perf_counter()
            start = sample["start"].to(self.device).unsqueeze(0)
            steps = sample["steps"].to(self.device).unsqueeze(0)
            lengths = sample["length"].to(self.device).unsqueeze(0)
            output = self.model(
                start=start,
                steps=steps,
                lengths=lengths,
                max_outer_steps=max_outer_steps or self.settings.trm.max_outer_steps,
                max_inner_steps=max_inner_steps or self.settings.trm.max_inner_steps,
            )
            total_inner = max_inner_steps or self.settings.trm.max_inner_steps
            halt_threshold = halt_threshold or self.settings.trm.halt_threshold
            logits = output["logits"][0]
            halt_logits = output["halt_logits"][0]
            halt_probs = torch.sigmoid(halt_logits)
            final_idx = logits.shape[0] - 1
            halted_early = False
            steps_used = 0
            for outer_idx in range(logits.shape[0]):
                steps_used += total_inner
                if halt_probs[outer_idx].item() >= halt_threshold:
                    final_idx = outer_idx
                    halted_early = outer_idx < logits.shape[0] - 1
                    break
            probs = torch.softmax(logits[final_idx], dim=-1)
            prediction = int(torch.argmax(probs).item())
            confidence = float(probs[prediction].item())
            latency_ms = (time.perf_counter() - start_time) * 1000
        return InferenceResult(
            prediction=prediction,
            confidence=confidence,
            halted_early=halted_early,
            steps_used=steps_used,
            latency_ms=latency_ms,
            logits=logits,
        )

    def _compute_losses(
        self,
        batch: Dict[str, Tensor],
        output: Dict[str, Tensor],
        criterion: nn.Module,
        halt_criterion: nn.Module,
        max_outer_steps: int,
    ) -> Tensor:
        target = batch["target"].to(self.device)
        lengths = batch["length"].to(self.device)
        logits = output["logits"]
        halt_logits = output["halt_logits"]
        loss = 0.0
        for outer_idx in range(max_outer_steps):
            loss = loss + criterion(logits[:, outer_idx, :], target)
        loss = loss / max_outer_steps
        halt_targets = torch.zeros_like(halt_logits)
        for outer_idx in range(max_outer_steps):
            halt_targets[:, outer_idx] = (lengths <= outer_idx + 1).float()
        halt_loss = halt_criterion(halt_logits, halt_targets)
        return loss + halt_loss

    def train(self) -> TrainingReport:
        settings = self.settings
        train_cfg = settings.training
        dataset = OperationSequenceDataset(
            size=train_cfg.dataset_size,
            vocab_path=self.base_dir / "data" / "operations_vocab.json",
            seed=train_cfg.seed,
        )
        val_size = int(train_cfg.validation_split * len(dataset))
        train_size = len(dataset) - val_size
        train_ds, val_ds = random_split(dataset, [train_size, val_size])
        train_loader = DataLoader(train_ds, batch_size=train_cfg.batch_size, shuffle=True)
        val_loader = DataLoader(val_ds, batch_size=train_cfg.batch_size)

        optimizer = AdamW(
            self.model.parameters(),
            lr=train_cfg.learning_rate,
            weight_decay=train_cfg.weight_decay,
        )
        scheduler = CosineAnnealingLR(optimizer, T_max=train_cfg.epochs)
        criterion = nn.CrossEntropyLoss()
        halt_criterion = nn.BCEWithLogitsLoss()
        best_val_loss = float("inf")
        epochs_without_improvement = 0
        best_checkpoint = self._resolve_path(train_cfg.checkpoint_path)

        avg_train_loss = 0.0
        epoch = -1
        for epoch in range(train_cfg.epochs):
            self.model.train()
            epoch_loss = 0.0
            for batch in train_loader:
                optimizer.zero_grad()
                output = self.model(
                    start=batch["start"].to(self.device),
                    steps=batch["steps"].to(self.device),
                    lengths=batch["length"].to(self.device),
                    max_outer_steps=settings.trm.max_outer_steps,
                    max_inner_steps=settings.trm.max_inner_steps,
                )
                loss = self._compute_losses(
                    batch, output, criterion, halt_criterion, settings.trm.max_outer_steps
                )
                loss.backward()
                nn.utils.clip_grad_norm_(
                    self.model.parameters(), train_cfg.gradient_clip_norm
                )
                optimizer.step()
                self._update_ema()
                epoch_loss += loss.item()
            scheduler.step()
            avg_train_loss = epoch_loss / max(len(train_loader), 1)

            self.model.eval()
            val_loss = 0.0
            with torch.no_grad():
                for batch in val_loader:
                    output = self.model(
                        start=batch["start"].to(self.device),
                        steps=batch["steps"].to(self.device),
                        lengths=batch["length"].to(self.device),
                        max_outer_steps=settings.trm.max_outer_steps,
                        max_inner_steps=settings.trm.max_inner_steps,
                    )
                    loss = self._compute_losses(
                        batch, output, criterion, halt_criterion, settings.trm.max_outer_steps
                    )
                    val_loss += loss.item()
            avg_val_loss = val_loss / max(len(val_loader), 1)

            if avg_val_loss < best_val_loss:
                best_val_loss = avg_val_loss
                epochs_without_improvement = 0
                self.save_checkpoint(train_cfg.checkpoint_path)
            else:
                epochs_without_improvement += 1
                if epochs_without_improvement >= train_cfg.patience:
                    break

        epochs_run = max(epoch + 1, 0)
        return TrainingReport(
            epochs_run=epochs_run,
            train_loss=avg_train_loss,
            val_loss=best_val_loss,
            best_checkpoint=self._resolve_path(train_cfg.checkpoint_path),
        )


__all__ = ["TrmEngine", "InferenceResult", "TrainingReport"]
