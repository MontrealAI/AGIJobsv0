"""Validator Constellation Demo package.

This package exposes a high-level interface that powers the
Validator Constellation & Sentinel Guardrails demonstration.  It
collects the core primitives required to simulate validator
committee selection, commit–reveal voting, zero-knowledge batch
attestation, sentinel anomaly detection and domain-scoped
emergency pause controls.  The modules are intentionally
lightweight, deterministic and dependency-free so that
non-technical operators can run the demo in constrained
environments without needing blockchain infrastructure access.
"""

from .config import SystemConfig
from .identity import ENSIdentityVerifier, ENSOwnershipProof
from .staking import StakeManager, ValidatorStake
from .events import EventBus, Event
from .vrf import VRFCoordinator
from .commit_reveal import CommitRevealRound, VoteCommitment, VoteReveal
from .zk_batch import ZKBatchAttestor, JobResult, BatchProof
from .sentinel import (
    SentinelMonitor,
    SentinelAlert,
    AgentAction,
    DomainPauseController,
    SentinelRule,
    PauseRecord,
    DomainState,
)
from .demo_runner import (
    DemoSummary,
    run_validator_constellation_demo,
    run_validator_constellation_scenario,
    summary_to_dict,
    write_web_artifacts,
)
from .subgraph import SubgraphIndexer, IndexedEvent
from .governance import OwnerConsole, OwnerAction

__all__ = [
    "SystemConfig",
    "ENSIdentityVerifier",
    "ENSOwnershipProof",
    "StakeManager",
    "ValidatorStake",
    "EventBus",
    "Event",
    "VRFCoordinator",
    "CommitRevealRound",
    "VoteCommitment",
    "VoteReveal",
    "ZKBatchAttestor",
    "JobResult",
    "BatchProof",
    "SentinelMonitor",
    "SentinelAlert",
    "AgentAction",
    "DomainPauseController",
    "SentinelRule",
    "PauseRecord",
    "DomainState",
    "SubgraphIndexer",
    "IndexedEvent",
    "OwnerConsole",
    "OwnerAction",
    "DemoSummary",
    "summary_to_dict",
    "write_web_artifacts",
    "run_validator_constellation_demo",
    "run_validator_constellation_scenario",
]
