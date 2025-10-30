"""Automated safety rails for the AGI Alpha Node demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import List

from .ens import ENSVerifier
from .governance import GovernanceController
from .stake import StakeManager
from .state import StateStore


@dataclass(slots=True)
class SafetyViolation:
    """Represents a single invariant breach."""

    code: str
    message: str


@dataclass(slots=True)
class SafetyEvaluation:
    """Snapshot of the node's current protection posture."""

    safe: bool
    ens_verified: bool
    stake_sufficient: bool
    paused: bool
    ens_domain: str
    ens_owner: str
    ens_source: str
    violations: List[SafetyViolation] = field(default_factory=list)


class SafetyController:
    """Automated safety rails coordinating ENS, stake, and pause controls."""

    def __init__(
        self,
        store: StateStore,
        stake_manager: StakeManager,
        ens_verifier: ENSVerifier,
        governance: GovernanceController,
    ) -> None:
        self.store = store
        self.stake_manager = stake_manager
        self.ens_verifier = ens_verifier
        self.governance = governance

    # ------------------------------------------------------------------
    def evaluate(self) -> SafetyEvaluation:
        """Assess the current state against all safety invariants."""

        ens_result = self.ens_verifier.verify()
        stake_ok = self.stake_manager.meets_minimum()
        state = self.store.read()
        violations: List[SafetyViolation] = []

        if not ens_result.verified:
            violations.append(
                SafetyViolation(
                    code="ens",
                    message=(
                        "ENS ownership mismatch – operations locked until the configured "
                        "owner controls the domain"
                    ),
                )
            )
        if not stake_ok:
            violations.append(
                SafetyViolation(
                    code="stake",
                    message=(
                        f"Stake below minimum requirement of {self.stake_manager.settings.minimum_stake} "
                        f"{self.stake_manager.settings.asset_symbol}"
                    ),
                )
            )
        if state.paused:
            reason = state.pause_reason or "operator pause"
            violations.append(
                SafetyViolation(
                    code="paused",
                    message=f"Node operations are paused ({reason})",
                )
            )

        return SafetyEvaluation(
            safe=not violations,
            ens_verified=ens_result.verified,
            stake_sufficient=stake_ok,
            paused=state.paused,
            ens_domain=ens_result.domain,
            ens_owner=ens_result.owner,
            ens_source=ens_result.source,
            violations=violations,
        )

    # ------------------------------------------------------------------
    def guard(self, operation: str, *, auto_resume: bool = True) -> SafetyEvaluation:
        """Enforce safety before executing a critical operation."""

        evaluation = self.evaluate()
        state = self.store.read()
        if evaluation.safe:
            if state.paused and state.pause_reason.startswith("safety") and auto_resume:
                self.governance.resume_all(f"safety-auto-resume:{operation}")
            return evaluation

        if (
            len(evaluation.violations) == 1
            and evaluation.violations[0].code == "paused"
            and state.pause_reason.startswith("safety")
            and auto_resume
        ):
            self.governance.resume_all(f"safety-auto-resume:{operation}")
            return self.evaluate()

        relevant = [
            violation
            for violation in evaluation.violations
            if violation.code != "paused" or state.pause_reason.startswith("safety")
        ]
        if relevant:
            reason = f"safety:{operation}:{'-'.join(v.code for v in relevant)}"
            self.store.update(last_safety_violation=reason)
            if not state.paused or state.pause_reason.startswith("safety"):
                self.governance.pause_all(reason)
        return evaluation

    # ------------------------------------------------------------------
    def conduct_drill(self) -> SafetyEvaluation:
        """Run a pause/resume drill to validate the emergency pathway."""

        self.governance.pause_all("safety:drill:init")
        self.governance.resume_all("safety:drill:complete")
        state = self.store.read()
        antifragility = min(1.0, state.antifragility_index + 0.05)
        self.store.update(antifragility_index=antifragility)
        self.store.append_audit(
            f"[{datetime.now(UTC).isoformat()}Z] safety-drill antifragility={antifragility:.2f}"
        )
        return self.evaluate()


__all__ = ["SafetyController", "SafetyEvaluation", "SafetyViolation"]
