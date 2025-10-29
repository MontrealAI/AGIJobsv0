"""Core Tiny Recursive Model engine used by the demo."""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np

from .weights import DEFAULT_WEIGHTS


EPSILON = 1e-9


def _sigmoid(value: float) -> float:
    value = max(min(value, 60.0), -60.0)
    return 1.0 / (1.0 + math.exp(-value))


def _binary_cross_entropy(pred: float, target: float) -> float:
    pred = min(max(pred, EPSILON), 1.0 - EPSILON)
    return -(target * math.log(pred) + (1.0 - target) * math.log(1.0 - pred))


@dataclass
class TinyRecursiveModelConfig:
    """Configuration for the Tiny Recursive Model."""

    input_dim: int = 9
    hidden_dim: int = 12
    n_cycles: int = 6
    outer_steps: int = 3
    halt_threshold: float = 0.6
    halting_weight: float = 0.5
    ema_decay: float = 0.999
    initial_output: float = 0.5
    max_steps: int = 18

    def copy(self) -> "TinyRecursiveModelConfig":
        return TinyRecursiveModelConfig(
            input_dim=self.input_dim,
            hidden_dim=self.hidden_dim,
            n_cycles=self.n_cycles,
            outer_steps=self.outer_steps,
            halt_threshold=self.halt_threshold,
            halting_weight=self.halting_weight,
            ema_decay=self.ema_decay,
            initial_output=self.initial_output,
            max_steps=self.max_steps,
        )


@dataclass
class TinyRecursiveModelResult:
    """Result container for Tiny Recursive Model inference."""

    prediction: float
    steps_used: int
    halted: bool
    trajectory: List[Dict[str, float]]
    latency_ms: float

    @property
    def confidence(self) -> float:
        """Return a convenience confidence score in [0, 1]."""

        return abs(self.prediction - 0.5) * 2.0


class TinyRecursiveModel:
    """Tiny Recursive Model with recursive latent state updates and halting."""

    def __init__(
        self,
        config: Optional[TinyRecursiveModelConfig] = None,
        weights: Optional[Dict[str, np.ndarray]] = None,
    ) -> None:
        self.config = config.copy() if config else TinyRecursiveModelConfig()
        self._params = self._initialise_parameters(weights)
        self._ema_params = {name: value.copy() for name, value in self._params.items()}

    @staticmethod
    def _initialise_parameters(
        weights: Optional[Dict[str, np.ndarray]]
    ) -> Dict[str, np.ndarray]:
        if weights is None:
            weights = DEFAULT_WEIGHTS
        return {
            name: np.array(value, dtype=np.float64)
            for name, value in weights.items()
        }

    # ------------------------------------------------------------------
    # Inference API
    # ------------------------------------------------------------------
    def infer(
        self,
        features: np.ndarray,
        *,
        halt_threshold: Optional[float] = None,
        n_cycles: Optional[int] = None,
        outer_steps: Optional[int] = None,
        use_ema: bool = True,
        include_trajectory: bool = True,
    ) -> TinyRecursiveModelResult:
        """Run recursive inference on the provided feature vector."""

        active_config = self.config.copy()
        if halt_threshold is not None:
            active_config.halt_threshold = float(halt_threshold)
        if n_cycles is not None:
            active_config.n_cycles = max(1, int(n_cycles))
        if outer_steps is not None:
            active_config.outer_steps = max(1, int(outer_steps))

        params = self._ema_params if use_ema else self._params
        start = time.perf_counter()
        prediction, halted, caches, total_steps = self._forward_pass(
            features, params, active_config
        )
        elapsed_ms = (time.perf_counter() - start) * 1_000.0

        trajectory: List[Dict[str, float]] = []
        if include_trajectory:
            for index, cache in enumerate(caches):
                trajectory.append(
                    {
                        "step": float(index + 1),
                        "probability": float(cache["y"][0]),
                        "halt_probability": float(cache["halt_prob"][0]),
                        "latent_l2": float(np.linalg.norm(cache["z"], ord=2)),
                    }
                )

        return TinyRecursiveModelResult(
            prediction=float(prediction),
            steps_used=total_steps,
            halted=halted,
            trajectory=trajectory,
            latency_ms=elapsed_ms,
        )

    def _forward_pass(
        self,
        features: np.ndarray,
        params: Dict[str, np.ndarray],
        runtime_config: TinyRecursiveModelConfig,
        *,
        attach_training_metadata: bool = False,
        target: Optional[float] = None,
    ) -> Tuple[float, bool, List[Dict[str, np.ndarray]], int]:
        """Run the TRM recurrence and optionally collect training metadata."""

        if features.shape[0] != runtime_config.input_dim:
            raise ValueError(
                f"Expected feature dimension {runtime_config.input_dim}, got {features.shape[0]}"
            )

        max_cycles = runtime_config.outer_steps * runtime_config.n_cycles
        if runtime_config.max_steps:
            max_cycles = min(max_cycles, runtime_config.max_steps)

        y_prev = runtime_config.initial_output
        latent = np.zeros(runtime_config.hidden_dim, dtype=np.float64)
        caches: List[Dict[str, np.ndarray]] = []
        halted = False
        total_cycles = 0

        for outer_index in range(runtime_config.outer_steps):
            cycle_traces: List[Dict[str, np.ndarray]] = []
            for cycle_index in range(runtime_config.n_cycles):
                if total_cycles >= max_cycles:
                    break
                input_vec = np.concatenate((features, latent, np.array([y_prev])))
                pre_activation = params["W_z"] @ input_vec + params["b_z"]
                latent = np.tanh(pre_activation)
                cycle_traces.append(
                    {
                        "input": input_vec,
                        "pre_activation": pre_activation,
                        "latent": latent.copy(),
                    }
                )
                total_cycles += 1

            readout_input = np.concatenate((latent, np.array([y_prev])))
            logits = float(np.dot(params["W_y"], readout_input) + params["b_y"][0])
            y_curr = _sigmoid(logits)
            halt_logit = float(np.dot(params["W_h"][0], latent) + params["b_h"][0])
            halt_prob = _sigmoid(halt_logit)

            cache: Dict[str, np.ndarray] = {
                "outer_step": np.array([outer_index], dtype=np.float64),
                "z": latent.copy(),
                "y_prev": np.array([y_prev], dtype=np.float64),
                "y": np.array([y_curr], dtype=np.float64),
                "logits": np.array([logits], dtype=np.float64),
                "halt_prob": np.array([halt_prob], dtype=np.float64),
                "halt_logit": np.array([halt_logit], dtype=np.float64),
                "cycles": cycle_traces,
            }

            if attach_training_metadata and target is not None:
                cache["target"] = np.array([target], dtype=np.float64)
            caches.append(cache)

            y_prev = y_curr
            if halt_prob >= runtime_config.halt_threshold or total_cycles >= max_cycles:
                halted = True
                break

        return y_prev, halted, caches, total_cycles

    # ------------------------------------------------------------------
    # Training utilities
    # ------------------------------------------------------------------
    def train(
        self,
        dataset: Iterable[Tuple[np.ndarray, float]],
        *,
        epochs: int = 10,
        learning_rate: float = 0.05,
        halting_weight: Optional[float] = None,
        use_ema: bool = True,
    ) -> List[Dict[str, float]]:
        """Fine-tune the readout and halting heads using supervised data."""

        if halting_weight is not None:
            self.config.halting_weight = float(halting_weight)

        logs: List[Dict[str, float]] = []
        dataset_list = list(dataset)
        if not dataset_list:
            return logs

        for epoch in range(epochs):
            total_loss = 0.0
            total_halt_loss = 0.0
            grads = {
                "W_y": np.zeros_like(self._params["W_y"]),
                "b_y": np.zeros_like(self._params["b_y"]),
                "W_h": np.zeros_like(self._params["W_h"]),
                "b_h": np.zeros_like(self._params["b_h"]),
            }

            for features, target in dataset_list:
                _, _, caches, total_cycles = self._forward_pass(
                    features,
                    self._params,
                    self.config,
                    attach_training_metadata=True,
                    target=target,
                )
                if not caches:
                    continue

                step_count = len(caches)
                grad_y_carry = 0.0
                sample_grads = {
                    "W_y": np.zeros_like(self._params["W_y"]),
                    "b_y": np.zeros_like(self._params["b_y"]),
                    "W_h": np.zeros_like(self._params["W_h"]),
                    "b_h": np.zeros_like(self._params["b_h"]),
                }

                for step_index in reversed(range(step_count)):
                    cache = caches[step_index]
                    prediction = float(cache["y"][0])
                    halt_prob = float(cache["halt_prob"][0])
                    y_prev = float(cache["y_prev"][0])
                    latent = cache["z"]
                    halt_target = 1.0 if step_index == step_count - 1 else 0.0

                    loss_step = _binary_cross_entropy(prediction, target)
                    halt_loss = _binary_cross_entropy(halt_prob, halt_target)
                    total_loss += loss_step
                    total_halt_loss += halt_loss

                    grad_output = (prediction - target) / max(
                        prediction * (1.0 - prediction), EPSILON
                    )
                    grad_output += grad_y_carry

                    derivative = prediction * (1.0 - prediction)
                    grad_logits = grad_output * derivative

                    readout_input = np.concatenate((latent, np.array([y_prev])))
                    sample_grads["W_y"] += grad_logits * readout_input
                    sample_grads["b_y"] += grad_logits

                    backprop_input = self._params["W_y"].T * grad_logits
                    grad_y_carry = backprop_input[-1]

                    halt_grad = (halt_prob - halt_target) / max(
                        halt_prob * (1.0 - halt_prob), EPSILON
                    )
                    halt_grad *= self.config.halting_weight
                    halt_derivative = halt_prob * (1.0 - halt_prob)
                    grad_halt_logit = halt_grad * halt_derivative
                    sample_grads["W_h"] += grad_halt_logit * latent
                    sample_grads["b_h"] += grad_halt_logit

                # Normalise per-sample gradients by steps traversed for stability
                normaliser = float(total_cycles + 1)
                for key in sample_grads:
                    grads[key] += sample_grads[key] / normaliser

            sample_count = float(len(dataset_list))
            for key in ("W_y", "b_y", "W_h", "b_h"):
                grads[key] /= sample_count
                self._params[key] -= learning_rate * grads[key]

            if use_ema:
                for name in self._params:
                    self._ema_params[name] = (
                        self.config.ema_decay * self._ema_params[name]
                        + (1.0 - self.config.ema_decay) * self._params[name]
                    )

            logs.append(
                {
                    "epoch": float(epoch + 1),
                    "loss": total_loss / sample_count,
                    "halt_loss": total_halt_loss / sample_count,
                }
            )

        return logs

    # ------------------------------------------------------------------
    # Introspection helpers
    # ------------------------------------------------------------------
    def to_dict(self) -> Dict[str, List[float]]:
        """Serialise the current parameters into plain Python types."""

        return {name: value.tolist() for name, value in self._params.items()}

    def to_json(self) -> str:
        """Return a JSON representation of the current parameters."""

        return json.dumps(self.to_dict(), indent=2)

    def update_params(
        self,
        *,
        n_cycles: Optional[int] = None,
        outer_steps: Optional[int] = None,
        halt_threshold: Optional[float] = None,
    ) -> None:
        """Update runtime control parameters of the model."""

        if n_cycles is not None:
            self.config.n_cycles = max(1, int(n_cycles))
        if outer_steps is not None:
            self.config.outer_steps = max(1, int(outer_steps))
        if halt_threshold is not None:
            self.config.halt_threshold = float(halt_threshold)

    # Convenience wrappers ------------------------------------------------
    @classmethod
    def from_json(cls, payload: str, config: Optional[TinyRecursiveModelConfig] = None) -> "TinyRecursiveModel":
        """Create a model instance from a JSON payload."""

        weights = json.loads(payload)
        arrays = {name: np.array(value, dtype=np.float64) for name, value in weights.items()}
        return cls(config=config, weights=arrays)

    def clone(self) -> "TinyRecursiveModel":
        """Create a deep copy of the model."""

        return TinyRecursiveModel(self.config, {name: arr.copy() for name, arr in self._params.items()})

