"""Executable script to run the AGI Alpha Node demo end-to-end."""
from __future__ import annotations

import asyncio
import logging

import uvicorn

from alpha_node.console.cli import demo_job
from alpha_node.web.app import app


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    server = uvicorn.Server(uvicorn.Config(app, host="0.0.0.0", port=8080, loop="asyncio"))

    async def start_server() -> None:
        await server.serve()

    loop = asyncio.get_running_loop()
    loop.create_task(start_server())
    demo_job()


if __name__ == "__main__":
    asyncio.run(main())
