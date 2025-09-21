// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {TOKEN_SCALE} from "../Constants.sol";
import {ArbitratorCommittee} from "../ArbitratorCommittee.sol";

/// @title DisputeModule
/// @notice Allows job participants to raise disputes and resolves them after a
/// dispute window.
/// @dev Maintains tax neutrality by rejecting ether and escrowing only token
///      based dispute fees via the StakeManager. Assumes all token amounts use
///      18 decimals (`1 token == TOKEN_SCALE` units).
contract DisputeModule is Ownable, Pausable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

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

    address public pauser;

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
    event JurorSlashed(
        address indexed juror,
        uint256 amount,
        address indexed employer
    );
    event PauserUpdated(address indexed pauser);

    modifier onlyOwnerOrPauser() {
        require(
            msg.sender == owner() || msg.sender == pauser,
            "owner or pauser only"
        );
        _;
    }

    function setPauser(address _pauser) external onlyOwner {
        pauser = _pauser;
        emit PauserUpdated(_pauser);
    }
    event DisputeFeeUpdated(uint256 fee);
    event DisputeWindowUpdated(uint256 window);
    event JobRegistryUpdated(IJobRegistry newRegistry);
    event StakeManagerUpdated(IStakeManager newManager);
    event ModulesUpdated(address indexed jobRegistry, address indexed stakeManager);
    event CommitteeUpdated(address indexed committee);

    /// @param _jobRegistry Address of the JobRegistry contract.
    /// @param _disputeFee Initial dispute fee in token units (18 decimals); defaults to TOKEN_SCALE.
    /// @param _disputeWindow Minimum time in seconds before resolution; defaults to 1 day.
    /// @param _committee Address of the arbitrator committee contract.
    constructor(
        IJobRegistry _jobRegistry,
        uint256 _disputeFee,
        uint256 _disputeWindow,
        address _committee
    ) Ownable(msg.sender) {
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
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Update the JobRegistry reference.
    /// @param newRegistry New JobRegistry contract implementing IJobRegistry.
    function setJobRegistry(IJobRegistry newRegistry)
        external
        onlyOwner
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
        onlyOwner
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
        onlyOwner
        whenNotPaused
    {
        committee = newCommittee;
        emit CommitteeUpdated(newCommittee);
    }

    /// @notice Configure the dispute fee in token units (18 decimals).
    /// @param fee New dispute fee in token units (18 decimals); 0 disables the fee.
    function setDisputeFee(uint256 fee)
        external
        onlyOwner
        whenNotPaused
    {
        disputeFee = fee;
        emit DisputeFeeUpdated(fee);
    }

    /// @notice Configure the dispute resolution window in seconds.
    /// @param window Minimum time before a dispute can be resolved.
    function setDisputeWindow(uint256 window)
        external
        onlyOwner
        whenNotPaused
    {
        disputeWindow = window;
        emit DisputeWindowUpdated(window);
    }

    /// @notice Pause dispute operations.
    function pause() external onlyOwnerOrPauser {
        _pause();
    }

    /// @notice Resume dispute operations.
    function unpause() external onlyOwnerOrPauser {
        _unpause();
    }

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

        disputes[jobId].claimant = claimant;
        disputes[jobId].raisedAt = block.timestamp;
        disputes[jobId].resolved = false;
        disputes[jobId].fee = disputeFee;
        disputes[jobId].evidenceHash = evidenceHash;
        disputes[jobId].reason = reason;

        emit DisputeRaised(jobId, claimant, evidenceHash, reason);

        if (committee != address(0)) {
            ArbitratorCommittee(committee).openCase(jobId);
        }
    }

    /// @notice Resolve an existing dispute after the dispute window elapses.
    /// @param jobId Identifier of the disputed job.
    /// @param employerWins True if the employer prevails.
    /// @dev Only callable by the arbitrator committee.
    function resolveDispute(uint256 jobId, bool employerWins)
        public
        whenNotPaused
    {
        require(msg.sender == committee, "not committee");
        Dispute storage d = disputes[jobId];
        require(d.raisedAt != 0 && !d.resolved, "no dispute");
        require(block.timestamp >= d.raisedAt + disputeWindow, "window");
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);

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

        if (!employerWins && address(sm) != address(0)) {
            address valMod = address(jobRegistry.validationModule());
            if (valMod != address(0)) {
                address[] memory validators = IValidationModule(valMod).validators(jobId);
                uint256 count;
                for (uint256 i; i < validators.length; ++i) {
                    if (IValidationModule(valMod).votes(jobId, validators[i])) {
                        ++count;
                    }
                }
                address[] memory participants = new address[](count);
                uint256 p;
                for (uint256 i; i < validators.length; ++i) {
                    address v = validators[i];
                    if (IValidationModule(valMod).votes(jobId, v)) {
                        participants[p++] = v;
                    } else {
                        sm.slash(v, fee, employer, participants);
                    }
                }
            }
        }

        emit DisputeResolved(jobId, msg.sender, employerWins);
    }

    /// @notice Backwards-compatible alias for older integrations.
    function resolve(uint256 jobId, bool employerWins) external {
        resolveDispute(jobId, employerWins);
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
        require(msg.sender == committee, "not committee");
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

