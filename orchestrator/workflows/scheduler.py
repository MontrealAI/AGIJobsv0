"""Async task scheduler with concurrency controls and retries."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Awaitable, Callable, Dict

from orchestrator.tools.executors import RetryPolicy

LOGGER = logging.getLogger(__name__)

CoroutineFactory = Callable[[], Awaitable[object | None]]
CompletionHook = Callable[[bool, Exception | None], Awaitable[None] | None]


class TaskScheduler:
    """Dispatch coroutine tasks with concurrency limits and retries."""

    def __init__(
        self,
        *,
        concurrency: int,
        retry: RetryPolicy | None = None,
    ) -> None:
        if concurrency <= 0:
            raise ValueError("Concurrency must be positive")
        self._concurrency = concurrency
        self._retry = retry or RetryPolicy()
        self._inflight: set[str] = set()
        self._completed: set[str] = set()
        self._errors: Dict[str, Exception] = {}
        self._tasks: set[asyncio.Task[object | None]] = set()
        self._attempts: Dict[str, int] = defaultdict(int)
        self._lock: asyncio.Lock | None = None
        self._semaphore: asyncio.Semaphore | None = None

    def _ensure_lock(self) -> asyncio.Lock:
        lock = self._lock
        if lock is None:
            lock = asyncio.Lock()
            self._lock = lock
        return lock

    def _ensure_semaphore(self) -> asyncio.Semaphore:
        semaphore = self._semaphore
        if semaphore is None:
            semaphore = asyncio.Semaphore(self._concurrency)
            self._semaphore = semaphore
        return semaphore

    async def schedule(
        self,
        task_id: str,
        factory: CoroutineFactory,
        *,
        on_complete: CompletionHook | None = None,
    ) -> bool:
        """Schedule a task if it is not already running or completed."""

        lock = self._ensure_lock()
        async with lock:
            if task_id in self._completed or task_id in self._inflight:
                return False
            self._inflight.add(task_id)

        loop = asyncio.get_running_loop()
        task = loop.create_task(self._run_task(task_id, factory, on_complete))
        async with lock:
            self._tasks.add(task)
        return True

    async def _run_task(
        self,
        task_id: str,
        factory: CoroutineFactory,
        on_complete: CompletionHook | None,
    ) -> None:
        semaphore = self._ensure_semaphore()
        attempt = 0
        success = False
        error: Exception | None = None
        try:
            while attempt < self._retry.attempts:
                attempt += 1
                self._attempts[task_id] = attempt
                try:
                    async with semaphore:
                        await factory()
                    success = True
                    error = None
                    break
                except Exception as exc:  # pragma: no cover - defensive; exercised in tests
                    error = exc
                    if attempt >= self._retry.attempts:
                        break
                    delay = self._retry.backoff * (2 ** (attempt - 1))
                    try:
                        await asyncio.sleep(delay)
                    except asyncio.CancelledError:
                        raise
            if not success and error is not None:
                LOGGER.warning("Task %s failed after %d attempts: %s", task_id, attempt, error)
                self._errors[task_id] = error
            if on_complete is not None:
                try:
                    result = on_complete(success, error)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as hook_error:  # pragma: no cover - hook errors are rare
                    LOGGER.warning("Completion hook for %s raised: %s", task_id, hook_error)
        finally:
            lock = self._ensure_lock()
            async with lock:
                self._inflight.discard(task_id)
                self._completed.add(task_id)
                task = asyncio.current_task()
                if task is not None:
                    self._tasks.discard(task)

    async def wait_for_all(self) -> None:
        """Block until all scheduled tasks have completed."""

        lock = self._ensure_lock()
        while True:
            async with lock:
                if not self._tasks:
                    break
                tasks = list(self._tasks)
            await asyncio.gather(*tasks, return_exceptions=True)

    @property
    def errors(self) -> Dict[str, Exception]:
        """Return a mapping of task ids to the last error raised."""

        return dict(self._errors)

    @property
    def attempts(self) -> Dict[str, int]:
        """Return a mapping of task ids to the number of attempts performed."""

        return dict(self._attempts)
