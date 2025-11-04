import asyncio

from simulation.hgm.harness import run_simulation


def test_run_simulation_generates_snapshot():
    async def runner() -> None:
        snapshot = await run_simulation(expansions=3, concurrency=2, seed=123)

        assert "root" in snapshot
        child_entries = {key: data for key, data in snapshot.items() if key.startswith("root/")}
        assert child_entries, "Simulation should expand child nodes"
        for payload in child_entries.values():
            assert "visits" in payload
            assert payload["visits"] >= 1
            metadata = payload.get("metadata", {})
            assert "quality" in metadata

    asyncio.run(runner())
