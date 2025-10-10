// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {ITaxPolicy} from "../interfaces/ITaxPolicy.sol";
import {TOKEN_SCALE} from "../Constants.sol";
import {ArbitratorCommittee} from "../ArbitratorCommittee.sol";
import {Governable} from "../Governable.sol";

/// @title DisputeModule
/// @notice Allows job participants to raise disputes and resolves them after a
/// dispute window with optional moderator or committee oversight.
/// @dev Maintains tax neutrality by rejecting ether and escrowing only token
///      based dispute fees via the StakeManager. Assumes all token amounts use
///      18 decimals (`1 token == TOKEN_SCALE` units).
contract DisputeModule is Governable, Pausable {

    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    /// @dev Typed data hash for moderator approvals.
    bytes32 private constant _RESOLVE_TYPEHASH =
        keccak256(
            "ResolveDispute(uint256 jobId,bool employerWins,address module,uint256 chainId)"
        );

    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;

    /// @notice Default dispute fee charged when raising a dispute.
    /// @dev Expressed in token units with 18 decimals; equal to 1 token.
    uint256 public constant DEFAULT_DISPUTE_FEE = TOKEN_SCALE;

    /// @notice Fee required to initiate a dispute, in token units (18 decimals).
    /// @dev Defaults to `DEFAULT_DISPUTE_FEE` if zero is provided to the constructor.
    uint256 public disputeFee;

    /// @notice Time that must elapse before a dispute can be resolved.
    /// @dev Defaults to 1 day if zero is provided to the constructor.
    uint256 public disputeWindow;

    /// @notice Address of the arbitrator committee contract.
    address public committee;

    /// @notice Optional pauser delegate authorised by governance.
    address public pauser;
    /// @notice Delegate allowed to manage pause rights on behalf of governance.
    address public pauserManager;

    /// @notice Tax policy accepted by employers, agents, and validators.
    ITaxPolicy public taxPolicy;

    struct Dispute {
        address claimant;
        uint256 raisedAt;
        bool resolved;
        uint256 fee;
        bytes32 evidenceHash;
        string reason;
    }

    /// @dev Tracks active disputes by jobId.
    mapping(uint256 => Dispute) public disputes;

    /// @notice Moderator voting weight expressed as whole numbers.
    mapping(address => uint96) public moderatorWeights;

    /// @notice Aggregate moderator weight used when evaluating quorum.
    uint96 public totalModeratorWeight;

    event DisputeRaised(
        uint256 indexed jobId,
        address indexed claimant,
        bytes32 indexed evidenceHash,
        string reason
    );
    event DisputeResolved(
        uint256 indexed jobId,
        address indexed resolver,
        bool employerWins
    );
    event EvidenceSubmitted(
        uint256 indexed jobId,
        address indexed submitter,
        bytes32 indexed evidenceHash,
        string uri
    );
    event JurorSlashed(
        address indexed juror,
        uint256 amount,
        address indexed employer
    );
    event PauserUpdated(address indexed pauser);
    event PauserManagerUpdated(address indexed pauserManager);
    event ModeratorUpdated(address indexed moderator, uint256 weight);
    event DisputeFeeUpdated(uint256 fee);
    event DisputeWindowUpdated(uint256 window);
    event JobRegistryUpdated(IJobRegistry newRegistry);
    event StakeManagerUpdated(IStakeManager newManager);
    event ModulesUpdated(address indexed jobRegistry, address indexed stakeManager);
    event CommitteeUpdated(address indexed committee);
    event TaxPolicyUpdated(address indexed policy);

    error InvalidTaxPolicy();
    error PolicyNotTaxExempt();
    error NoActiveDispute();
    error EvidenceRequired();
    error UnauthorizedEvidenceSubmitter(address submitter);
    error InvalidModerator(address moderator);
    error InvalidModeratorWeight();
    error DuplicateModeratorSignature(address moderator);
    error InsufficientModeratorWeight(uint256 supplied, uint256 total);
    error NoModeratorsConfigured();
    error UnauthorizedResolver(address caller);
    error NotGovernanceOrPauser();
    error NotGovernanceOrPauserManager();

    /// @param _jobRegistry Address of the JobRegistry contract.
    /// @param _disputeFee Initial dispute fee in token units (18 decimals); defaults to TOKEN_SCALE.
    /// @param _disputeWindow Minimum time in seconds before resolution; defaults to 1 day.
    /// @param _committee Address of the arbitrator committee contract.
    /// @param _governance Timelock or multisig controlling privileged actions.
    constructor(
        IJobRegistry _jobRegistry,
        uint256 _disputeFee,
        uint256 _disputeWindow,
        address _committee,
        address _governance
    ) Governable(_governance) {
        if (address(_jobRegistry) != address(0)) {
            jobRegistry = _jobRegistry;
            emit JobRegistryUpdated(_jobRegistry);
        }
        emit ModulesUpdated(address(_jobRegistry), address(0));

        disputeFee = _disputeFee > 0 ? _disputeFee : DEFAULT_DISPUTE_FEE;
        emit DisputeFeeUpdated(disputeFee);

        disputeWindow = _disputeWindow > 0 ? _disputeWindow : 1 days;
        emit DisputeWindowUpdated(disputeWindow);

        committee = _committee;
        emit CommitteeUpdated(_committee);
    }

    /// @notice Restrict functions to the JobRegistry.
    modifier onlyJobRegistry() {
        require(msg.sender == address(jobRegistry), "not registry");
        _;
    }

    // ---------------------------------------------------------------------
    // Governance configuration
    // ---------------------------------------------------------------------

    /// @notice Update the JobRegistry reference.
    /// @param newRegistry New JobRegistry contract implementing IJobRegistry.
    function setJobRegistry(IJobRegistry newRegistry)
        external
        onlyGovernance
        whenNotPaused
    {
        jobRegistry = newRegistry;
        emit JobRegistryUpdated(newRegistry);
        emit ModulesUpdated(address(newRegistry), address(stakeManager));
    }

    /// @notice Update the StakeManager reference.
    /// @param newManager New StakeManager contract implementing IStakeManager.
    function setStakeManager(IStakeManager newManager)
        external
        onlyGovernance
        whenNotPaused
    {
        stakeManager = newManager;
        emit StakeManagerUpdated(newManager);
        emit ModulesUpdated(address(jobRegistry), address(newManager));
    }

    /// @notice Update the arbitrator committee contract.
    /// @param newCommittee New committee contract address.
    function setCommittee(address newCommittee)
        external
        onlyGovernance
        whenNotPaused
    {
        committee = newCommittee;
        emit CommitteeUpdated(newCommittee);
    }

    /// @notice Update the tax policy contract.
    /// @param policy Address of the TaxPolicy contract employers and agents acknowledge.
    function setTaxPolicy(ITaxPolicy policy)
        external
        onlyGovernance
        whenNotPaused
    {
        _setTaxPolicy(policy);
    }

    /// @notice Configure the dispute fee in token units (18 decimals).
    /// @param fee New dispute fee in token units (18 decimals); 0 disables the fee.
    function setDisputeFee(uint256 fee)
        external
        onlyGovernance
        whenNotPaused
    {
        disputeFee = fee;
        emit DisputeFeeUpdated(fee);
    }

    /// @notice Configure the dispute resolution window in seconds.
    /// @param window Minimum time before a dispute can be resolved.
    function setDisputeWindow(uint256 window)
        external
        onlyGovernance
        whenNotPaused
    {
        disputeWindow = window;
        emit DisputeWindowUpdated(window);
    }

    /// @notice Assign or update a moderator's voting weight.
    /// @param moderator Address receiving the specified weight.
    /// @param weight Non-zero weight enables the moderator; zero removes them.
    function setModerator(address moderator, uint96 weight) external onlyGovernance {
        if (moderator == address(0)) revert InvalidModerator(moderator);
        uint96 current = moderatorWeights[moderator];
        if (weight == current) revert InvalidModeratorWeight();

        if (current > 0) {
            totalModeratorWeight -= current;
        }
        if (weight > 0) {
            totalModeratorWeight += weight;
            moderatorWeights[moderator] = weight;
        } else {
            delete moderatorWeights[moderator];
        }

        emit ModeratorUpdated(moderator, weight);
    }

    /// @notice Convenience helper mirroring {setModerator} removal semantics.
    function removeModerator(address moderator) external onlyGovernance {
        uint96 current = moderatorWeights[moderator];
        if (current == 0) revert InvalidModeratorWeight();
        totalModeratorWeight -= current;
        delete moderatorWeights[moderator];
        emit ModeratorUpdated(moderator, 0);
    }

    /// @notice Sets or clears an address permitted to pause dispute processing.
    function setPauser(address _pauser) external {
        if (msg.sender != address(governance) && msg.sender != pauserManager) {
            revert NotGovernanceOrPauserManager();
        }
        pauser = _pauser;
        emit PauserUpdated(_pauser);
    }

    function setPauserManager(address manager) external onlyGovernance {
        pauserManager = manager;
        emit PauserManagerUpdated(manager);
    }

    function _checkGovernanceOrPauser() internal view {
        if (msg.sender != address(governance) && msg.sender != pauser) {
            revert NotGovernanceOrPauser();
        }
    }

    /// @notice Pause dispute operations.
    function pause() external {
        _checkGovernanceOrPauser();
        _pause();
    }

    /// @notice Resume dispute operations.
    function unpause() external {
        _checkGovernanceOrPauser();
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Dispute lifecycle
    // ---------------------------------------------------------------------

    /// @notice Raise a dispute by posting the dispute fee and supplying a
    /// hash of off-chain evidence.
    /// @dev The full evidence must be stored off-chain (e.g., IPFS) and its
    /// `keccak256` hash provided here. Only the hash is stored and emitted on
    /// chain to keep costs low.
    /// @param jobId Identifier of the job being disputed.
    /// @param claimant Address of the participant raising the dispute.
    /// @param evidenceHash Keccak256 hash of the external evidence. Must be
    /// non-zero.
    function raiseDispute(
        uint256 jobId,
        address claimant,
        bytes32 evidenceHash,
        string calldata reason
    ) external onlyJobRegistry whenNotPaused {
        require(
            evidenceHash != bytes32(0) || bytes(reason).length != 0,
            "evidence"
        );
        Dispute storage d = disputes[jobId];
        require(d.raisedAt == 0, "disputed");

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        require(
            claimant == job.agent || claimant == job.employer,
            "not participant"
        );

        IStakeManager sm = _stakeManager();
        if (address(sm) != address(0)) {
            if (disputeFee > 0) {
                sm.lockDisputeFee(claimant, disputeFee);
            }
            sm.recordDispute();
        }

        d.claimant = claimant;
        d.raisedAt = block.timestamp;
        d.resolved = false;
        d.fee = disputeFee;
        d.evidenceHash = evidenceHash;
        d.reason = reason;

        emit DisputeRaised(jobId, claimant, evidenceHash, reason);

        if (committee != address(0)) {
            ArbitratorCommittee(committee).openCase(jobId);
        }
    }

    /// @notice Governance-only helper to raise a dispute without charging fees.
    /// @dev Used during incident response to escalate stuck jobs. Caller is the
    ///      timelock/SystemPause via the JobRegistry.
    function raiseGovernanceDispute(uint256 jobId, string calldata reason)
        external
        onlyGovernance
        whenNotPaused
    {
        require(bytes(reason).length != 0, "reason");
        Dispute storage d = disputes[jobId];
        require(d.raisedAt == 0, "disputed");

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        address claimant = job.employer;
        if (claimant == address(0)) {
            claimant = job.agent;
        }
        require(claimant != address(0), "job");

        d.claimant = claimant;
        d.raisedAt = block.timestamp;
        d.resolved = false;
        d.fee = 0;
        d.evidenceHash = bytes32(0);
        d.reason = reason;

        emit DisputeRaised(jobId, claimant, bytes32(0), reason);

        if (committee != address(0)) {
            ArbitratorCommittee(committee).openCase(jobId);
        }
    }

    /// @notice Resolve an existing dispute after the dispute window elapses.
    /// @param jobId Identifier of the disputed job.
    /// @param employerWins True if the employer prevails.
    function resolveDispute(uint256 jobId, bool employerWins)
        public
        whenNotPaused
    {
        _checkDirectResolutionAuthority(msg.sender);
        _resolve(jobId, employerWins, msg.sender);
    }

    /// @notice Backwards-compatible alias for older integrations.
    function resolve(uint256 jobId, bool employerWins) external {
        resolveDispute(jobId, employerWins);
    }

    /// @notice Resolve an existing dispute using off-chain moderator approvals.
    /// @param signatures Moderator signatures proving quorum agreement.
    function resolveWithSignatures(
        uint256 jobId,
        bool employerWins,
        bytes[] calldata signatures
    ) external whenNotPaused {
        if (signatures.length == 0) revert InvalidModeratorWeight();
        Dispute storage d = disputes[jobId];
        require(d.raisedAt != 0 && !d.resolved, "no dispute");
        require(block.timestamp >= d.raisedAt + disputeWindow, "window");

        uint96 totalWeight = totalModeratorWeight;
        if (totalWeight == 0) revert NoModeratorsConfigured();

        bytes32 digest = resolutionMessageHash(jobId, employerWins);
        uint96 accumulated;
        address[] memory seen = new address[](signatures.length);
        for (uint256 i; i < signatures.length; ++i) {
            address signer = ECDSA.recover(digest, signatures[i]);
            uint96 weight = moderatorWeights[signer];
            if (weight == 0) revert InvalidModerator(signer);
            for (uint256 j; j < i; ++j) {
                if (seen[j] == signer) {
                    revert DuplicateModeratorSignature(signer);
                }
            }
            seen[i] = signer;
            accumulated += weight;
        }

        if (accumulated * 2 <= totalWeight) {
            revert InsufficientModeratorWeight(accumulated, totalWeight);
        }

        _resolve(jobId, employerWins, msg.sender);
    }

    /// @notice Submit additional evidence or context for an existing dispute.
    /// @dev Emits an {EvidenceSubmitted} event; no on-chain storage is mutated to
    ///      keep costs minimal while retaining an auditable trail.
    /// @param jobId Identifier of the job under dispute.
    /// @param evidenceHash Optional keccak256 hash of off-chain evidence blob.
    /// @param uri Optional URI or plaintext description for human reviewers.
    function submitEvidence(
        uint256 jobId,
        bytes32 evidenceHash,
        string calldata uri
    ) external whenNotPaused {
        Dispute storage d = disputes[jobId];
        if (d.raisedAt == 0 || d.resolved) revert NoActiveDispute();
        if (evidenceHash == bytes32(0) && bytes(uri).length == 0) {
            revert EvidenceRequired();
        }

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        bool authorized = msg.sender == job.agent || msg.sender == job.employer;
        if (!authorized) {
            address valModule = address(jobRegistry.validationModule());
            if (valModule != address(0)) {
                address[] memory committeeMembers = IValidationModule(valModule).validators(jobId);
                for (uint256 i; i < committeeMembers.length; ++i) {
                    if (committeeMembers[i] == msg.sender) {
                        authorized = true;
                        break;
                    }
                }
            }
        }
        if (!authorized) {
            revert UnauthorizedEvidenceSubmitter(msg.sender);
        }

        emit EvidenceSubmitted(jobId, msg.sender, evidenceHash, uri);
    }

    /// @notice Slash a validator for absenteeism during dispute resolution.
    /// @param juror Address of the juror being slashed.
    /// @param amount Token amount to slash.
    /// @param employer Employer receiving the slashed share.
    /// @dev Only callable by the arbitrator committee.
    function slashValidator(
        address juror,
        uint256 amount,
        address employer
    ) external whenNotPaused {
        if (msg.sender != committee) revert UnauthorizedResolver(msg.sender);
        IStakeManager sm = _stakeManager();
        if (address(sm) != address(0) && amount > 0) {
            sm.slash(juror, amount, employer);
        }
        emit JurorSlashed(juror, amount, employer);
    }

    function _stakeManager() internal view returns (IStakeManager) {
        if (address(stakeManager) != address(0)) {
            return stakeManager;
        }
        return IStakeManager(jobRegistry.stakeManager());
    }

    function _setTaxPolicy(ITaxPolicy policy) internal {
        if (address(policy) == address(0)) revert InvalidTaxPolicy();
        if (!policy.isTaxExempt()) revert PolicyNotTaxExempt();
        taxPolicy = policy;
        emit TaxPolicyUpdated(address(policy));
    }

    function _checkDirectResolutionAuthority(address caller) internal view {
        if (caller == committee) {
            return;
        }
        uint96 weight = moderatorWeights[caller];
        if (weight > 0 && weight * 2 > totalModeratorWeight) {
            return;
        }
        if (caller == address(governance)) {
            return;
        }
        revert UnauthorizedResolver(caller);
    }

    function _resolve(uint256 jobId, bool employerWins, address resolver) internal {
        Dispute storage d = disputes[jobId];
        require(d.raisedAt != 0 && !d.resolved, "no dispute");
        require(block.timestamp >= d.raisedAt + disputeWindow, "window");

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        (address[] memory validators, bool[] memory votes) =
            jobRegistry.validatorCommittee(jobId);

        d.resolved = true;

        address employer = job.employer;
        address recipient = employerWins ? employer : d.claimant;
        uint256 fee = d.fee;
        delete disputes[jobId];

        jobRegistry.resolveDispute(jobId, employerWins);

        IStakeManager sm = _stakeManager();
        if (fee > 0 && address(sm) != address(0)) {
            sm.payDisputeFee(recipient, fee);
        }

        if (
            address(sm) != address(0) &&
            validators.length > 0 &&
            votes.length == validators.length &&
            fee > 0
        ) {
            uint256 correctCount;
            for (uint256 i; i < validators.length; ++i) {
                if (votes[i] != employerWins) {
                    ++correctCount;
                }
            }

            address[] memory participants = new address[](correctCount);
            uint256 index;
            for (uint256 i; i < validators.length; ++i) {
                if (votes[i] != employerWins) {
                    participants[index++] = validators[i];
                }
            }

            for (uint256 i; i < validators.length; ++i) {
                if (votes[i] == employerWins) {
                    sm.slash(validators[i], fee, employer, participants);
                }
            }
        }

        emit DisputeResolved(jobId, resolver, employerWins);
    }

    /// @notice Returns the digest moderators must sign when approving a resolution.
    function resolutionMessageHash(uint256 jobId, bool employerWins)
        public
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(_RESOLVE_TYPEHASH, jobId, employerWins, address(this), block.chainid)
        );
        return MessageHashUtils.toEthSignedMessageHash(structHash);
    }

    /// @notice Confirms the module and its owner cannot accrue tax liabilities.
    /// @return Always true, signalling perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers; all fees are handled in tokens.
    receive() external payable {
        revert("DisputeModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("DisputeModule: no ether");
    }
}
