"""Initial schema for persisting HGM lineage data."""

from __future__ import annotations

from backend.database import Migration


class Migration0001Initial(Migration):
    version = "0001_initial"

    def upgrade(self, cursor, driver: str) -> None:  # type: ignore[override]
        if driver == "postgres":
            statements = [
                """
                CREATE TABLE IF NOT EXISTS hgm_runs (
                    run_id TEXT PRIMARY KEY,
                    root_agent TEXT NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at DOUBLE PRECISION NOT NULL,
                    updated_at DOUBLE PRECISION NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS hgm_agents (
                    run_id TEXT NOT NULL REFERENCES hgm_runs(run_id) ON DELETE CASCADE,
                    agent_key TEXT NOT NULL,
                    parent_key TEXT,
                    depth INTEGER NOT NULL DEFAULT 0,
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    expansion_count DOUBLE PRECISION NOT NULL DEFAULT 0,
                    clade_success DOUBLE PRECISION NOT NULL DEFAULT 0,
                    clade_failure DOUBLE PRECISION NOT NULL DEFAULT 0,
                    created_at DOUBLE PRECISION NOT NULL,
                    updated_at DOUBLE PRECISION NOT NULL,
                    PRIMARY KEY (run_id, agent_key)
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS hgm_agent_performance (
                    run_id TEXT NOT NULL,
                    agent_key TEXT NOT NULL,
                    visits DOUBLE PRECISION NOT NULL DEFAULT 0,
                    success_weight DOUBLE PRECISION NOT NULL DEFAULT 0,
                    failure_weight DOUBLE PRECISION NOT NULL DEFAULT 0,
                    cmp_mean DOUBLE PRECISION NOT NULL DEFAULT 0,
                    cmp_variance DOUBLE PRECISION NOT NULL DEFAULT 0,
                    cmp_weight DOUBLE PRECISION NOT NULL DEFAULT 0,
                    updated_at DOUBLE PRECISION NOT NULL,
                    PRIMARY KEY (run_id, agent_key),
                    FOREIGN KEY (run_id, agent_key) REFERENCES hgm_agents(run_id, agent_key) ON DELETE CASCADE
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS hgm_evaluation_outcomes (
                    id BIGSERIAL PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    agent_key TEXT NOT NULL,
                    reward DOUBLE PRECISION NOT NULL,
                    weight DOUBLE PRECISION NOT NULL,
                    success BOOLEAN NOT NULL,
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at DOUBLE PRECISION NOT NULL,
                    FOREIGN KEY (run_id, agent_key) REFERENCES hgm_agents(run_id, agent_key) ON DELETE CASCADE
                )
                """,
                "CREATE INDEX IF NOT EXISTS idx_hgm_runs_created_at ON hgm_runs(created_at)",
                "CREATE INDEX IF NOT EXISTS idx_hgm_agents_parent ON hgm_agents(run_id, parent_key)",
                "CREATE INDEX IF NOT EXISTS idx_hgm_agents_depth ON hgm_agents(run_id, depth)",
                "CREATE INDEX IF NOT EXISTS idx_hgm_agent_perf_cmp ON hgm_agent_performance(run_id, cmp_mean)",
                "CREATE INDEX IF NOT EXISTS idx_hgm_eval_agent ON hgm_evaluation_outcomes(run_id, agent_key, created_at)"
            ]
        else:
            statements = [
                """
                CREATE TABLE IF NOT EXISTS hgm_runs (
                    run_id TEXT PRIMARY KEY,
                    root_agent TEXT NOT NULL,
                    metadata TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS hgm_agents (
                    run_id TEXT NOT NULL REFERENCES hgm_runs(run_id) ON DELETE CASCADE,
                    agent_key TEXT NOT NULL,
                    parent_key TEXT,
                    depth INTEGER NOT NULL DEFAULT 0,
                    metadata TEXT NOT NULL,
                    expansion_count REAL NOT NULL DEFAULT 0,
                    clade_success REAL NOT NULL DEFAULT 0,
                    clade_failure REAL NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    PRIMARY KEY (run_id, agent_key)
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS hgm_agent_performance (
                    run_id TEXT NOT NULL,
                    agent_key TEXT NOT NULL,
                    visits REAL NOT NULL DEFAULT 0,
                    success_weight REAL NOT NULL DEFAULT 0,
                    failure_weight REAL NOT NULL DEFAULT 0,
                    cmp_mean REAL NOT NULL DEFAULT 0,
                    cmp_variance REAL NOT NULL DEFAULT 0,
                    cmp_weight REAL NOT NULL DEFAULT 0,
                    updated_at REAL NOT NULL,
                    PRIMARY KEY (run_id, agent_key),
                    FOREIGN KEY (run_id, agent_key) REFERENCES hgm_agents(run_id, agent_key) ON DELETE CASCADE
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS hgm_evaluation_outcomes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    agent_key TEXT NOT NULL,
                    reward REAL NOT NULL,
                    weight REAL NOT NULL,
                    success INTEGER NOT NULL,
                    payload TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    FOREIGN KEY (run_id, agent_key) REFERENCES hgm_agents(run_id, agent_key) ON DELETE CASCADE
                )
                """,
                "CREATE INDEX IF NOT EXISTS idx_hgm_runs_created_at ON hgm_runs(created_at)",
                "CREATE INDEX IF NOT EXISTS idx_hgm_agents_parent ON hgm_agents(run_id, parent_key)",
                "CREATE INDEX IF NOT EXISTS idx_hgm_agents_depth ON hgm_agents(run_id, depth)",
                "CREATE INDEX IF NOT EXISTS idx_hgm_agent_perf_cmp ON hgm_agent_performance(run_id, cmp_mean)",
                "CREATE INDEX IF NOT EXISTS idx_hgm_eval_agent ON hgm_evaluation_outcomes(run_id, agent_key, created_at)"
            ]
        for statement in statements:
            cursor.execute(statement)


__all__ = ["Migration0001Initial"]
