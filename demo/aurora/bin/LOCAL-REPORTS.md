# Preserving local rehearsal reports

The Zenith Sapience, Celestial Archon, Omnidominion and Planetary OS local wrappers accept an unset `NETWORK` (defaulting to `localhost`) or the explicit value `localhost`. Other values, including an explicit empty string, and positional arguments are rejected before report preparation or execution.

Before a new run, `prepare-local-reports.cjs` checks that every component under `reports/localhost/<scope>` is a real directory. A symlink or file in that path fails closed. Existing reports are renamed into a uniquely named sibling `<scope>-previous-*/reports`; their bytes remain available. The next run receives a fresh report directory. Nothing is recursively deleted.

If execution later fails, retain both the new partial report and its archived predecessor for diagnosis. These are ordinary local files, without a power-loss durability guarantee. The checks assume a trusted local filesystem; they are not isolation against another process racing directory changes.

The helper accepts only these four fixed scopes. It does not select a network, execute a job, or authorize a chain transaction. Wrapper safety tests use a private temporary repository and stub the downstream npm command; they do not establish contract or mission completion.
