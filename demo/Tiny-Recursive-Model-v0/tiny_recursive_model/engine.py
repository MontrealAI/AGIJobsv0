"""Tiny Recursive Model implementation with recursive refinement and halting."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import autograd.numpy as anp
import numpy as np
from autograd import grad
from rich.console import Console
from rich.table import Table

from .config import DemoConfig, ModelConfig, TrainingConfig
from .dataset import ReasoningDataset


console = Console()


@dataclass
class TrainingReport:
    train_loss: float
    val_loss: float
    steps: int


class TinyRecursiveModelEngine:
    """Implements training and inference for the Tiny Recursive Model."""

    def __init__(self, config: DemoConfig, artifact_dir: Path) -> None:
        self.config = config
        self.model_cfg: ModelConfig = config.model
        self.training_cfg: TrainingConfig = config.training
        self.random = np.random.default_rng(self.training_cfg.seed)
        self.shapes = self._parameter_shapes()
        self.total_params = sum(int(np.prod(shape)) for shape in self.shapes.values())
        self.params = self._init_params()
        self.ema_params = self.params.copy()
        self.artifact_dir = artifact_dir
        self.artifact_dir.mkdir(parents=True, exist_ok=True)
        (self.artifact_dir / "checkpoints").mkdir(exist_ok=True)

    # ------------------------------------------------------------------
    # Parameter utilities
    # ------------------------------------------------------------------
    def _parameter_shapes(self) -> Dict[str, Tuple[int, ...]]:
        cfg = self.model_cfg
        return {
            "W_in": (cfg.hidden_dim, cfg.input_dim + cfg.latent_dim + cfg.answer_dim),
            "b_in": (cfg.hidden_dim,),
            "W_z": (cfg.latent_dim, cfg.hidden_dim),
            "b_z": (cfg.latent_dim,),
            "W_y": (cfg.answer_dim, cfg.hidden_dim),
            "b_y": (cfg.answer_dim,),
            "W_h": (1, cfg.hidden_dim),
            "b_h": (1,),
        }

    def _init_params(self) -> np.ndarray:
        scale = self.model_cfg.weight_scale
        params = []
        for name, shape in self.shapes.items():
            size = int(np.prod(shape))
            if name.startswith("b_"):
                values = np.zeros(size, dtype=np.float64)
            else:
                values = self.random.normal(loc=0.0, scale=scale, size=size)
            params.append(values)
        return np.concatenate(params)

    def _unpack(self, vector: np.ndarray) -> Dict[str, anp.ndarray]:
        params: Dict[str, anp.ndarray] = {}
        offset = 0
        for name, shape in self.shapes.items():
            size = int(np.prod(shape))
            slice_ = vector[offset : offset + size]
            params[name] = anp.reshape(slice_, shape)
            offset += size
        return params

    def _pack(self, tensors: Dict[str, np.ndarray]) -> np.ndarray:
        parts: List[np.ndarray] = []
        for name in self.shapes:
            parts.append(np.asarray(tensors[name]).reshape(-1))
        return np.concatenate(parts)

    # ------------------------------------------------------------------
    # Autograd helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _softmax(logits: anp.ndarray) -> anp.ndarray:
        logits = logits - anp.max(logits)
        exp = anp.exp(logits)
        return exp / anp.sum(exp)

    @staticmethod
    def _sigmoid(x: anp.ndarray) -> anp.ndarray:
        return 1.0 / (1.0 + anp.exp(-x))

    @staticmethod
    def _cross_entropy(probs: anp.ndarray, label: int) -> anp.ndarray:
        eps = 1e-8
        return -anp.log(probs[label] + eps)

    @staticmethod
    def _binary_cross_entropy(prob: anp.ndarray, target: float) -> anp.ndarray:
        eps = 1e-8
        return -(target * anp.log(prob + eps) + (1 - target) * anp.log(1 - prob + eps))

    def _rollout(self, params: Dict[str, anp.ndarray], x: anp.ndarray) -> Tuple[anp.ndarray, anp.ndarray]:
        z = anp.zeros((self.model_cfg.latent_dim,))
        y_logits = anp.zeros((self.model_cfg.answer_dim,))
        outputs: List[anp.ndarray] = []
        halts: List[anp.ndarray] = []

        for _ in range(self.model_cfg.outer_steps):
            hidden = None
            for _ in range(self.model_cfg.inner_cycles):
                combined = anp.concatenate([x, z, self._softmax(y_logits)])
                hidden = anp.tanh(anp.dot(params["W_in"], combined) + params["b_in"])
                z = anp.tanh(z + anp.dot(params["W_z"], hidden) + params["b_z"])
                y_logits = y_logits + anp.dot(params["W_y"], hidden) + params["b_y"]
            outputs.append(y_logits)
            halt_logit = anp.dot(params["W_h"], hidden) + params["b_h"]
            halts.append(self._sigmoid(halt_logit))
        return anp.stack(outputs), anp.stack(halts)

    def _loss(self, vector: np.ndarray, batch_x: anp.ndarray, batch_y: anp.ndarray) -> anp.ndarray:
        params = self._unpack(vector)
        deep_w = self.training_cfg.deep_supervision_weight
        halt_w = self.training_cfg.halt_loss_weight
        total_loss = 0.0
        batch_size = batch_x.shape[0]
        for idx in range(batch_size):
            outputs, halts = self._rollout(params, batch_x[idx])
            n_steps = outputs.shape[0]
            for step in range(n_steps):
                probs = self._softmax(outputs[step])
                ce_loss = self._cross_entropy(probs, int(batch_y[idx]))
                weight = 1.0 if step == n_steps - 1 else deep_w
                total_loss = total_loss + weight * ce_loss
                target = 1.0 if step == n_steps - 1 else 0.0
                halt_loss = self._binary_cross_entropy(halts[step][0], target)
                total_loss = total_loss + halt_w * halt_loss
        return total_loss / batch_size

    # ------------------------------------------------------------------
    # Training loop
    # ------------------------------------------------------------------
    def train(self, dataset: ReasoningDataset, val_dataset: ReasoningDataset) -> TrainingReport:
        grad_fn = grad(self._loss)
        steps = 0
        best_val = math.inf
        for epoch in range(1, self.training_cfg.epochs + 1):
            epoch_loss = 0.0
            batches = list(dataset.batches(self.training_cfg.batch_size))
            self.random.shuffle(batches)
            for batch_x, batch_y in batches:
                gradients = grad_fn(self.params, batch_x, batch_y)
                self._apply_gradients(gradients)
                loss_value = float(self._loss(self.params, batch_x, batch_y))
                epoch_loss += loss_value
                steps += 1
            avg_loss = epoch_loss / max(len(batches), 1)
            if epoch % self.training_cfg.log_interval == 0:
                val_loss = float(self._loss(self.ema_params, *val_dataset.as_arrays()))
                console.log(f"Epoch {epoch}: train_loss={avg_loss:.4f} val_loss={val_loss:.4f}")
                if val_loss < best_val:
                    best_val = val_loss
                    self._save_checkpoint(epoch, steps, best=True)
            if epoch % self.training_cfg.checkpoint_interval == 0:
                self._save_checkpoint(epoch, steps)
        final_val = float(self._loss(self.ema_params, *val_dataset.as_arrays()))
        self._save_checkpoint(self.training_cfg.epochs, steps, best=True)
        return TrainingReport(train_loss=avg_loss, val_loss=final_val, steps=steps)

    def _apply_gradients(self, gradients: np.ndarray) -> None:
        lr = self.model_cfg.learning_rate
        grad_norm = float(np.linalg.norm(gradients))
        if grad_norm > self.model_cfg.max_grad_norm:
            gradients = gradients * (self.model_cfg.max_grad_norm / (grad_norm + 1e-8))
        self.params = self.params - lr * gradients
        self.ema_params = (
            self.config.model.ema_decay * self.ema_params
            + (1.0 - self.config.model.ema_decay) * self.params
        )

    # ------------------------------------------------------------------
    # Checkpointing
    # ------------------------------------------------------------------
    def _save_checkpoint(self, epoch: int, steps: int, best: bool = False) -> None:
        ckpt_dir = self.artifact_dir / "checkpoints"
        ckpt_dir.mkdir(exist_ok=True)
        suffix = "best" if best else f"epoch{epoch}"
        params = {k: v.tolist() for k, v in self._unpack(self.params).items()}
        ema_params = {k: v.tolist() for k, v in self._unpack(self.ema_params).items()}
        data = {
            "epoch": epoch,
            "steps": steps,
            "params": params,
            "ema_params": ema_params,
        }
        path = ckpt_dir / f"trm_{suffix}.json"
        path.write_text(json.dumps(data, indent=2))

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------
    def infer(self, x: np.ndarray, use_ema: bool = True) -> Dict[str, float]:
        vector = self.ema_params if use_ema else self.params
        params = self._unpack(vector)
        outputs, halts = self._rollout(params, anp.asarray(x))
        halt_threshold = self.model_cfg.halt_threshold
        steps_used = 0
        final_probs = None
        halt_prob = 0.0
        for step in range(outputs.shape[0]):
            probs = np.asarray(self._softmax(outputs[step]))
            halt_prob = float(halts[step][0])
            steps_used = (step + 1) * self.model_cfg.inner_cycles
            final_probs = probs
            if halt_prob >= halt_threshold:
                break
        assert final_probs is not None
        return {
            "probs": final_probs,
            "steps_used": steps_used,
            "halted": float(halt_prob >= halt_threshold),
            "halt_prob": halt_prob,
        }

    def evaluate_accuracy(self, dataset: ReasoningDataset) -> float:
        features, labels = dataset.as_arrays()
        correct = 0
        for idx in range(len(labels)):
            result = self.infer(features[idx])
            pred = int(np.argmax(result["probs"]))
            if pred == int(labels[idx]):
                correct += 1
        return correct / len(labels)

    def summary_table(self, dataset: ReasoningDataset) -> Table:
        table = Table(title="Tiny Recursive Model Evaluation")
        table.add_column("Metric")
        table.add_column("Value")
        accuracy = self.evaluate_accuracy(dataset)
        table.add_row("Accuracy", f"{accuracy * 100:.2f}%")
        table.add_row("Halt Threshold", f"{self.model_cfg.halt_threshold:.2f}")
        table.add_row("Inner Cycles", str(self.model_cfg.inner_cycles))
        table.add_row("Outer Steps", str(self.model_cfg.outer_steps))
        table.add_row("EMA Decay", f"{self.model_cfg.ema_decay:.3f}")
        return table

    @staticmethod
    def build_curriculum(training_cfg: TrainingConfig, seed: int) -> Tuple[ReasoningDataset, ReasoningDataset]:
        dataset = ReasoningDataset(seed=seed)
        dataset.generate(n_samples=2000)
        train, val = dataset.split(training_cfg.validation_split)
        return train, val

    @staticmethod
    def load_checkpoint(path: Path) -> np.ndarray:
        data = json.loads(path.read_text())
        params = []
        for name in ["W_in", "b_in", "W_z", "b_z", "W_y", "b_y", "W_h", "b_h"]:
            params.append(np.asarray(data["ema_params"][name]).reshape(-1))
        return np.concatenate(params)

    def restore(self, checkpoint: Path) -> None:
        vector = self.load_checkpoint(checkpoint)
        self.params = vector.copy()
        self.ema_params = vector.copy()
