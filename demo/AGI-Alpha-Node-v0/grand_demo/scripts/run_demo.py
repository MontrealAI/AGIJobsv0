"""Executable script to run the AGI Alpha Node demo end-to-end.

The script now bootstraps its own import paths so operators can execute it
directly (``python demo/AGI-Alpha-Node-v0/grand_demo/scripts/run_demo.py``)
without manually exporting ``PYTHONPATH``. It also allows tests to bypass the
Uvicorn server so the deterministic demo flow can be exercised without opening
network sockets.
"""
from __future__ import annotations

import asyncio
import importlib.util
import inspect
import logging
import sys
from pathlib import Path
from typing import Awaitable, Callable, Optional, TYPE_CHECKING

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
REPO_ROOT = PROJECT_ROOT.parent


def _bootstrap_sys_path() -> None:
    """Ensure local packages import cleanly when executed directly."""

    for path in (PROJECT_ROOT, REPO_ROOT):
        path_str = str(path)
        if path_str in sys.path:
            sys.path.remove(path_str)

    sys.path.insert(0, str(PROJECT_ROOT))
    sys.path.insert(1, str(REPO_ROOT))


_bootstrap_sys_path()

if TYPE_CHECKING:
    import uvicorn
for _name in list(sys.modules):
    if _name.startswith("alpha_node"):
        sys.modules.pop(_name, None)



def _build_server(app_obj: object, *, host: str, port: int) -> "uvicorn.Server":
    import uvicorn

    return uvicorn.Server(
        uvicorn.Config(app_obj, host=host, port=port, loop="asyncio", lifespan="off")
    )


def _resolve_config_path(config_path: Optional[Path]) -> Optional[Path]:
    if config_path is None:
        candidate = PROJECT_ROOT / "config" / "alpha-node.config.yaml"
        return candidate if candidate.exists() else None
    return config_path


def _supports_config_path(fn: Callable[..., object]) -> bool:
    try:
        import inspect

        sig = inspect.signature(fn)
    except (TypeError, ValueError):
        return False

    return any(
        param.name == "config_path" and param.kind in {param.POSITIONAL_OR_KEYWORD, param.KEYWORD_ONLY}
        for param in sig.parameters.values()
    )


async def _run_demo_job(
    demo_job_fn: Callable[..., Awaitable[None] | None],
    *,
    config_path: Optional[Path],
) -> None:
    kwargs = {}
    resolved = _resolve_config_path(config_path)
    if resolved is not None and _supports_config_path(demo_job_fn):
        kwargs["config_path"] = resolved

    result = demo_job_fn(**kwargs)
    if inspect.isawaitable(result):  # type: ignore[name-defined]
        await result  # type: ignore[arg-type]


async def main(
    *,
    host: str = "0.0.0.0",
    port: int = 8080,
    run_server: bool = True,
    demo_job_fn: Callable[..., Awaitable[None] | None] | None = None,
    app_obj: object | None = None,
    config_path: Optional[Path] = None,
) -> None:
    """Launch the demo job and, optionally, the local Uvicorn service."""

    logging.basicConfig(level=logging.INFO)

    if demo_job_fn is None:
        from alpha_node.console.cli import demo_job as default_demo_job

        demo_job_fn = default_demo_job

    if run_server and app_obj is None:
        if importlib.util.find_spec("fastapi") is not None:
            from alpha_node.web.app import app as default_app

            app_obj = default_app
        else:
            logging.warning(
                "FastAPI is not installed; running a minimal fallback app. "
                "Install the demo dependencies to enable the full dashboard."
            )

            async def fallback_app(scope, receive, send):  # type: ignore[no-untyped-def]
                if scope.get("type") != "http":
                    return
                await send(
                    {
                        "type": "http.response.start",
                        "status": 503,
                        "headers": [(b"content-type", b"text/plain; charset=utf-8")],
                    }
                )
                await send(
                    {
                        "type": "http.response.body",
                        "body": b"FastAPI is not installed. Install demo dependencies.",
                    }
                )

            app_obj = fallback_app

    server = _build_server(app_obj, host=host, port=port) if run_server else None
    server_task = asyncio.create_task(server.serve()) if server else None

    try:
        await _run_demo_job(demo_job_fn, config_path=config_path)
    finally:
        if server and server_task:
            server.should_exit = True
            server.force_exit = True
            try:
                await server_task
            except asyncio.CancelledError:
                logging.debug("Uvicorn server cancelled during shutdown", exc_info=True)


if __name__ == "__main__":
    asyncio.run(main())
