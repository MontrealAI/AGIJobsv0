// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {TOKEN_SCALE} from "../Constants.sol";
import {ArbitratorCommittee} from "../ArbitratorCommittee.sol";

/// @title DisputeModule
/// @notice Allows job participants to raise disputes and resolves them after a dispute window.
/// @dev Maintains tax neutrality by rejecting ether and escrowing only token-based dispute fees via the StakeManager.
/// Assumes all token amounts use 18 decimals (`1 token == TOKEN_SCALE` units).
contract DisputeModule is Ownable, Pausable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;

    /// @notice Default dispute fee (in tokens) required to initiate a dispute (1 token by default).
    uint256 public constant DEFAULT_DISPUTE_FEE = TOKEN_SCALE;
    /// @notice Fee required to initiate a dispute (in token units, 18 decimals).
    /// @dev Defaults to DEFAULT_DISPUTE_FEE if zero is provided to the constructor.
    uint256 public disputeFee;
    /// @notice Time (seconds) that must elapse before a dispute can be resolved.
    /// @dev Defaults to 1 day if zero is provided to the constructor.
    uint256 public disputeWindow;
    /// @notice Address of the arbitrator committee contract (resolves disputes).
    address public committee;
    /// @notice An optional address that can also pause/unpause this module (in addition to owner).
    address public pauser;

    struct Dispute {
        address claimant;
        uint256 raisedAt;
        bool resolved;
        uint256 fee;
        bytes32 evidenceHash;
    }
    /// @dev Tracks active disputes by jobId.
    mapping(uint256 => Dispute) public disputes;

    event DisputeRaised(uint256 indexed jobId, address indexed claimant, bytes32 indexed evidenceHash);
    event DisputeResolved(uint256 indexed jobId, address indexed resolver, bool employerWins);
    event JurorSlashed(address indexed juror, uint256 amount, address indexed employer);
    event PauserUpdated(address indexed pauser);
    event DisputeFeeUpdated(uint256 fee);
    event DisputeWindowUpdated(uint256 window);
    event JobRegistryUpdated(IJobRegistry newRegistry);
    event StakeManagerUpdated(IStakeManager newManager);
    event ModulesUpdated(address indexed jobRegistry, address indexed stakeManager);
    event CommitteeUpdated(address indexed committee);

    error NotOwnerOrPauser();
    error OnlyJobRegistry();
    error EvidenceMissing();
    error AlreadyDisputed();
    error NotParticipant();
    error NotCommittee();
    error NoActiveDispute();
    error DisputeWindowNotElapsed();

    modifier onlyOwnerOrPauser() {
        if (msg.sender != owner() && msg.sender != pauser) revert NotOwnerOrPauser();
        _;
    }
    modifier onlyJobRegistry() {
        if (msg.sender != address(jobRegistry)) revert OnlyJobRegistry();
        _;
    }

    /// @notice Update the optional pauser role.
    function setPauser(address _pauser) external onlyOwner {
        pauser = _pauser;
        emit PauserUpdated(_pauser);
    }

    /// @param _jobRegistry Address of the JobRegistry contract.
    /// @param _disputeFee Initial dispute fee in token units (18 decimals); defaults to TOKEN_SCALE.
    /// @param _disputeWindow Minimum time before a dispute can be resolved; defaults to 1 day.
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

    /// @notice Update the JobRegistry reference.
    function setJobRegistry(IJobRegistry newRegistry) external onlyOwner whenNotPaused {
        jobRegistry = newRegistry;
        emit JobRegistryUpdated(newRegistry);
        emit ModulesUpdated(address(newRegistry), address(stakeManager));
    }

    /// @notice Update the StakeManager reference.
    function setStakeManager(IStakeManager newManager) external onlyOwner whenNotPaused {
        stakeManager = newManager;
        emit StakeManagerUpdated(newManager);
        emit ModulesUpdated(address(jobRegistry), address(newManager));
    }

    /// @notice Update the arbitrator committee contract address.
    function setCommittee(address newCommittee) external onlyOwner whenNotPaused {
        committee = newCommittee;
        emit CommitteeUpdated(newCommittee);
    }

    /// @notice Configure the dispute fee (in token units, 18 decimals). Set to 0 to disable fees.
    function setDisputeFee(uint256 fee) external onlyOwner whenNotPaused {
        disputeFee = fee;
        emit DisputeFeeUpdated(fee);
    }

    /// @notice Configure the dispute resolution window (seconds).
    function setDisputeWindow(uint256 window) external onlyOwner whenNotPaused {
        disputeWindow = window;
        emit DisputeWindowUpdated(window);
    }

    /// @notice Pause dispute operations (emergency).
    function pause() external onlyOwnerOrPauser {
        _pause();
    }

    /// @notice Resume dispute operations.
    function unpause() external onlyOwnerOrPauser {
        _unpause();
    }

    /// @notice Raise a dispute by paying the dispute fee and supplying a hash of off-chain evidence.
    /// @param jobId Identifier of the job being disputed.
    /// @param claimant Address of the participant raising the dispute (must be job's agent or employer).
    /// @param evidenceHash Keccak256 hash of the external evidence (must be non-zero).
    function raiseDispute(
        uint256 jobId,
        address claimant,
        bytes32 evidenceHash
    ) external onlyJobRegistry whenNotPaused {
        if (evidenceHash == bytes32(0)) revert EvidenceMissing();
        Dispute storage d = disputes[jobId];
        if (d.raisedAt != 0) revert AlreadyDisputed();

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        if (claimant != job.agent && claimant != job.employer) revert NotParticipant();

        // Lock dispute fee via StakeManager, if configured
        IStakeManager sm = _stakeManager();
        if (address(sm) != address(0) && disputeFee > 0) {
            sm.lockDisputeFee(claimant, disputeFee);
        }

        disputes[jobId] = Dispute({
            claimant: claimant,
            raisedAt: block.timestamp,
            resolved: false,
            fee: disputeFee,
            evidenceHash: evidenceHash
        });

        emit DisputeRaised(jobId, claimant, evidenceHash);

        // Notify the ArbitratorCommittee (if set) to open a case with jurors
        if (committee != address(0)) {
            ArbitratorCommittee(committee).openCase(jobId);
        }
    }

    /// @notice Resolve an existing dispute after the dispute window elapses.
    /// @param jobId Identifier of the disputed job.
    /// @param employerWins True if the employer prevails, false if the agent wins.
    /// @dev Only callable by the ArbitratorCommittee.
    function resolve(uint256 jobId, bool employerWins) external whenNotPaused {
        if (msg.sender != committee) revert NotCommittee();
        Dispute storage d = disputes[jobId];
        if (d.raisedAt == 0 || d.resolved) revert NoActiveDispute();
        if (block.timestamp < d.raisedAt + disputeWindow) revert DisputeWindowNotElapsed();
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);

        d.resolved = true;
        address employer = job.employer;
        address recipient = employerWins ? employer : d.claimant;
        uint256 fee = d.fee;
        delete disputes[jobId];

        // Update job state via JobRegistry
        jobRegistry.resolveDispute(jobId, employerWins);

        // Unlock or distribute the dispute fee via StakeManager
        IStakeManager sm = _stakeManager();
        if (fee > 0 && address(sm) != address(0)) {
            sm.payDisputeFee(recipient, fee);
        }

        // If agent wins (employer loses), slash any validators who voted incorrectly (abstained)
        if (!employerWins && address(sm) != address(0)) {
            address valModAddr = address(jobRegistry.validationModule());
            if (valModAddr != address(0)) {
                address[] memory validators = IValidationModule(valModAddr).validators(jobId);
                for (uint256 i = 0; i < validators.length; ++i) {
                    if (!IValidationModule(valModAddr).votes(jobId, validators[i])) {
                        sm.slash(validators[i], fee, employer);
                    }
                }
            }
        }

        emit DisputeResolved(jobId, msg.sender, employerWins);
    }

    /// @notice Slash a validator for absenteeism during dispute resolution.
    /// @param juror Address of the juror being slashed.
    /// @param amount Token amount to slash.
    /// @param employer Employer receiving the slashed portion.
    /// @dev Only callable by the ArbitratorCommittee.
    function slashValidator(address juror, uint256 amount, address employer) external whenNotPaused {
        if (msg.sender != committee) revert NotCommittee();
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
    /// @return Always true (module is perpetually tax-exempt).
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection (no ETH accepted in this module)
    // ---------------------------------------------------------------
    receive() external payable {
        revert("DisputeModule: no ether");
    }
    fallback() external payable {
        revert("DisputeModule: no ether");
    }
}

