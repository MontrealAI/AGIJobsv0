# Audit Dossier Workspace

Generated artefacts from `tools/audit/prepare_dossier.sh` are stored in timestamped subfolders
under this directory. The workspace is intentionally empty in version control so that auditors and
operators can share a clean archive without risking accidental leakage of prior reports.

Do not commit raw audit findings or logs that contain secrets. Instead, add sanitized summaries or
use encrypted releases as documented in `docs/external-audit-plan.md`.
