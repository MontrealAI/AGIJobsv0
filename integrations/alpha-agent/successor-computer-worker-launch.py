"""Explicit host-laboratory launcher; the immutable Alpha worker itself is unchanged."""

import argparse
import asyncio
import runpy
import json
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", type=Path, required=True)
    parser.add_argument("--chromium-executable", type=Path)
    parser.add_argument("--runtime-record", type=Path, required=True)
    args = parser.parse_args()
    executable = args.chromium_executable.resolve(strict=True) if args.chromium_executable else None
    if executable is not None and not executable.is_file():
        raise ValueError("Chromium executable must be an explicit regular file")
    from playwright.async_api import BrowserType
    launch = BrowserType.launch

    async def launch_selected(browser_type, **options):
        if browser_type.name != "chromium":
            raise ValueError("This laboratory admits Chromium only")
        if executable:
            options["executable_path"] = str(executable)
            options["args"] = list(dict.fromkeys([*options.get("args", []), "--no-sandbox", "--disable-dev-shm-usage"]))
        browser = await launch(browser_type, **options)
        record = {"engine": "chromium", "version": browser.version, "executableSelection": str(executable) if executable else "Playwright-managed headless default", "scope": "Observed runtime identity, not security or live-model qualification"}
        with args.runtime_record.open("x", encoding="utf-8") as stream:
            os.chmod(args.runtime_record, 0o600)
            json.dump(record, stream)
            stream.flush()
            os.fsync(stream.fileno())
        return browser

    BrowserType.launch = launch_selected
    namespace = runpy.run_path(str(args.worker.resolve(strict=True)))
    asyncio.run(namespace["main"]())


if __name__ == "__main__":
    main()
