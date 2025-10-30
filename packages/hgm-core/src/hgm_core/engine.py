"""Core scheduling logic for hierarchical generative modelling."""

from __future__ import annotations

import asyncio
import math
from dataclasses import replace
from typing import Awaitable, Callable, Dict, Optional, Sequence
from .config import EngineConfig
from .sampling import ThompsonSampler, posterior_parameters
from .types import AgentNode

Callback = Callable[[AgentNode, Dict[str, object]], Awaitable[None] | None]


class HGMEngine:
    """Stateful engine implementing widening and Thompson sampling.

    The engine operates on a sparse dictionary of :class:`AgentNode` objects
    and provides concurrency safe helpers to drive the expansion/evaluation
    loop used by the orchestrator. Callbacks supplied through the constructor
    are always invoked outside of the internal lock which makes it safe to
    perform I/O in reaction to state updates.
    """

    def __init__(
        self,
        config: EngineConfig | None = None,
        *,
        on_expansion_result: Callback | None = None,
        on_evaluation_result: Callback | None = None,
    ) -> None:
        self._config = config or EngineConfig()
        self._nodes: Dict[str, AgentNode] = {}
        self._lock = asyncio.Lock()
        self._sampler = ThompsonSampler(seed=self._config.seed)
        self._on_expansion_result = on_expansion_result
        self._on_evaluation_result = on_evaluation_result
        self._expansion_gate = True

    async def ensure_node(self, key: str, **metadata: object) -> AgentNode:
        """Return a node, creating it when necessary."""

        async with self._lock:
            node = self._nodes.get(key)
            if node is None:
                node = AgentNode(key=key, metadata=dict(metadata))
                self._nodes[key] = node
            else:
                node.metadata.update(metadata)
            return node

    async def next_action(self, key: str, actions: Sequence[str]) -> Optional[str]:
        """Return the next action using the widening rule and Thompson sampling."""

        if not actions:
            return None

        return_action: Optional[str] = None

        async with self._lock:
            if not self._expansion_gate:
                return None
            node = self._nodes.get(key)
            if node is None:
                node = AgentNode(key=key)
                self._nodes[key] = node

            if _is_pruned(node):
                return None

            widened_limit = max(
                1,
                int(
                    math.floor(
                        max(node.visits, self._config.min_visitations)
                        ** self._config.widening_alpha
                    )
                ),
            )
            children = node.metadata.setdefault("children", [])
            explored_set = set(children)

            if len(children) < min(widened_limit, len(actions)):
                for action in actions:
                    if action not in explored_set:
                        children.append(action)
                        child = AgentNode(key=f"{key}/{action}", parent=key)
                        self._nodes[child.key] = child
                        return_action = action
                        break
                else:
                    return_action = None
            else:
                return_action = None

            if return_action is not None:
                action = return_action
            else:
                if not children:
                    return actions[0]

                alphas = []
                betas = []
                arms = []
                for action in children:
                    child_key = f"{key}/{action}"
                    child = self._nodes.setdefault(
                        child_key, AgentNode(key=child_key, parent=key)
                    )
                    if _is_pruned(child):
                        continue
                    alpha, beta = posterior_parameters(
                        child.success_weight,
                        child.failure_weight,
                        self._config.thompson_prior,
                    )
                    alphas.append(alpha)
                    betas.append(beta)
                    arms.append(action)
                if not arms:
                    return None
                choice = self._sampler.choose(arms, alphas, betas)
                action = choice.arm

        return action

    async def set_expansion_gate(self, allowed: bool) -> None:
        """Enable or disable further expansions."""

        async with self._lock:
            self._expansion_gate = bool(allowed)

    async def expansions_allowed(self) -> bool:
        """Return whether expansions are currently permitted."""

        async with self._lock:
            return self._expansion_gate

    async def mark_pruned(self, key: str, *, reason: str | None = None) -> None:
        """Mark a node as pruned by sentinel guardrails."""

        async with self._lock:
            node = self._nodes.get(key)
            if node is None:
                return
            sentinel_meta = _ensure_sentinel_meta(node)
            sentinel_meta["pruned"] = True
            if reason is not None:
                sentinel_meta["reason"] = reason

    async def is_pruned(self, key: str) -> bool:
        """Return whether the specified node is pruned."""

        async with self._lock:
            node = self._nodes.get(key)
            if node is None:
                return False
            return _is_pruned(node)

    async def record_expansion(self, key: str, action: str, *, payload: Optional[dict[str, object]] = None) -> None:
        """Record the result of expanding an action."""

        payload = dict(payload or {})
        child_key = f"{key}/{action}"
        async with self._lock:
            child = self._nodes.setdefault(child_key, AgentNode(key=child_key, parent=key))
            child.metadata.update(payload)
        if self._on_expansion_result is not None:
            callback_payload = {"action": action, **payload}
            await _invoke_callback(self._on_expansion_result, child, callback_payload)

    async def record_evaluation(
        self,
        key: str,
        reward: float,
        *,
        weight: float = 1.0,
        payload: Optional[Dict[str, object]] = None,
    ) -> None:
        """Record the evaluation outcome for a node."""

        extra = dict(payload or {})

        async with self._lock:
            node = self._nodes.setdefault(key, AgentNode(key=key))
            node.record_reward(reward, weight)

            parent_key = node.parent
            while parent_key is not None:
                parent = self._nodes.setdefault(parent_key, AgentNode(key=parent_key))
                parent.record_reward(reward, weight)
                parent_key = parent.parent

            payload = {"reward": reward, "weight": weight, "cmp": node.cmp.to_dict(), **extra}
        if self._on_evaluation_result is not None:
            await _invoke_callback(self._on_evaluation_result, node, payload)

    async def snapshot(self) -> Dict[str, AgentNode]:
        """Return a shallow copy of the nodes tracked by the engine."""

        async with self._lock:
            return dict(self._nodes)

    async def get_config(self) -> EngineConfig:
        """Return a copy of the engine configuration in a threadsafe manner."""

        async with self._lock:
            return replace(self._config)

    async def update_parameters(
        self,
        *,
        widening_alpha: Optional[float] = None,
        min_visitations: Optional[int] = None,
        thompson_prior: Optional[float] = None,
    ) -> EngineConfig:
        """Update runtime parameters of the engine in a threadsafe manner.

        Parameters are clamped to sensible ranges to avoid invalid values and the
        resulting configuration snapshot is returned to the caller.
        """

        async with self._lock:
            if widening_alpha is not None:
                if widening_alpha <= 0:
                    raise ValueError("widening_alpha must be positive")
                self._config.widening_alpha = float(widening_alpha)
            if min_visitations is not None:
                if min_visitations <= 0:
                    raise ValueError("min_visitations must be positive")
                self._config.min_visitations = int(min_visitations)
            if thompson_prior is not None:
                if thompson_prior <= 0:
                    raise ValueError("thompson_prior must be positive")
                self._config.thompson_prior = float(thompson_prior)

            return replace(self._config)


async def _invoke_callback(callback: Callback, node: AgentNode, payload: Dict[str, object]) -> None:
    """Invoke a callback that may be synchronous or asynchronous."""

    result = callback(node, payload)
    if asyncio.iscoroutine(result):
        await result


def _ensure_sentinel_meta(node: AgentNode) -> Dict[str, object]:
    sentinel_meta = node.metadata.get("sentinel")
    if not isinstance(sentinel_meta, dict):
        sentinel_meta = {}
        node.metadata["sentinel"] = sentinel_meta
    return sentinel_meta


def _is_pruned(node: AgentNode) -> bool:
    sentinel_meta = node.metadata.get("sentinel")
    if not isinstance(sentinel_meta, dict):
        return False
    return bool(sentinel_meta.get("pruned"))
