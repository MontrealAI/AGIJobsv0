# CULTURE Demo Contracts Roadmap

Two core contracts will be implemented per CR-01/02 and SA-01/02:

1. **CultureRegistry.sol**
   - ERC-721-like registry for knowledge artifacts with citation graph support.
   - Integrates Ownable, Pausable, ReentrancyGuard, IdentityRegistry role checks.
   - Emits `ArtifactMinted`, `ArtifactCited`, `ArtifactUpdated` events consumed by the indexer.

2. **SelfPlayArena.sol**
   - Manages self-play rounds, linking teacher/student/validator jobs on the AGI Jobs platform.
   - Maintains difficulty ledger, emits lifecycle events, exposes admin parameter setters.
   - Hooks into ValidationModule and StakeManager for commit–reveal and slashing.

Comprehensive Foundry test suites and fuzz harnesses will live beside these contracts once development begins.
