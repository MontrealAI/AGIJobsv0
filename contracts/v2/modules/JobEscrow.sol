// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AGIALPHA, AGIALPHA_DECIMALS} from "../Constants.sol";
import {IJobRegistryAck} from "../interfaces/IJobRegistryAck.sol";

interface IRoutingModule {
    function selectOperator(bytes32 jobId) external returns (address);
}

/// @title JobEscrow
/// @notice Minimal job management with escrowed payments in an 18-decimal
/// ERC20 token (AGIALPHA by default). Jobs are routed to operators via the
/// RoutingModule. Rewards are released to the operator once the employer
/// accepts the submitted result or after a timeout.
contract JobEscrow is Ownable {
    using SafeERC20 for IERC20;

    /// @notice Module version for compatibility checks.
    uint256 public constant version = 1;

    enum State { None, Posted, Submitted, Accepted, Cancelled }

    struct Job {
        address employer;
        address operator;
        uint256 reward; // token reward in 18-decimal units
        State state;
        uint256 submittedAt;
        string data;
        string result;
    }

    uint256 public constant TIMEOUT = 3 days;
    /// @notice default $AGIALPHA token used when no token is specified
    address public constant DEFAULT_TOKEN = AGIALPHA;

    IERC20 public token;
    IRoutingModule public routingModule;
    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;
    address public jobRegistry;

    event RoutingModuleUpdated(address indexed routingModule);
    event JobRegistryUpdated(address indexed jobRegistry);
    /// @notice Emitted when a job is posted.
    /// @param jobId Identifier of the job.
    /// @param employer Address that posted the job.
    /// @param operator Selected operator for the job.
    /// @param reward Escrowed reward amount with 18 decimals.
    /// @param data Metadata describing the job.
    event JobPosted(
        uint256 indexed jobId,
        address indexed employer,
        address indexed operator,
        uint256 reward,
        string data
    );
    event JobCancelled(uint256 indexed jobId);
    event ResultSubmitted(uint256 indexed jobId, string result);
    event ResultAccepted(uint256 indexed jobId, address caller);

    /// @param _token ERC20 token used for rewards; must have 18 decimals. Pass
    /// zero address to use the default token.
    /// @param _routing Routing module used to select operators for new jobs.
    constructor(IERC20 _token, IRoutingModule _routing) Ownable(msg.sender) {
        if (address(_token) == address(0)) {
            token = IERC20(DEFAULT_TOKEN);
        } else {
            IERC20Metadata meta = IERC20Metadata(address(_token));
            require(meta.decimals() == AGIALPHA_DECIMALS, "decimals");
            token = _token;
        }
        routingModule = _routing;
    }
    
    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    function setRoutingModule(IRoutingModule newRouting) external onlyOwner {
        routingModule = newRouting;
        emit RoutingModuleUpdated(address(newRouting));
    }

    function setJobRegistry(address registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    /// @notice Post a new job and escrow the reward.
    /// @param reward Amount of tokens to escrow, expressed with 18 decimals.
    /// @param data Metadata describing the job.
    /// @return jobId Identifier of the created job.
    function postJob(uint256 reward, string calldata data) external returns (uint256 jobId) {
        require(reward > 0, "reward");
        address operator = routingModule.selectOperator(bytes32(nextJobId));
        require(operator != address(0), "operator");
        jobId = nextJobId++;
        token.safeTransferFrom(msg.sender, address(this), reward);
        jobs[jobId] = Job({
            employer: msg.sender,
            operator: operator,
            reward: reward,
            state: State.Posted,
            submittedAt: 0,
            data: data,
            result: ""
        });
        emit JobPosted(jobId, msg.sender, operator, reward, data);
    }

    /// @notice Operator submits the result for a job.
    /// @param jobId Identifier of the job.
    /// @param result Result data or URI.
    function submitResult(uint256 jobId, string calldata result) external {
        Job storage job = jobs[jobId];
        require(job.state == State.Posted, "state");
        require(msg.sender == job.operator, "operator");
        job.state = State.Submitted;
        job.submittedAt = block.timestamp;
        job.result = result;
        emit ResultSubmitted(jobId, result);
    }

    /// @notice Cancel a job before completion.
    /// @param jobId Identifier of the job.
    function cancelJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.state == State.Posted, "state");
        require(msg.sender == job.employer, "employer");
        job.state = State.Cancelled;
        token.safeTransfer(job.employer, job.reward);
        emit JobCancelled(jobId);
    }

    function _accept(uint256 jobId) internal {
        Job storage job = jobs[jobId];
        require(job.state == State.Submitted, "state");
        if (msg.sender == job.employer) {
            // employer approval
        } else if (msg.sender == job.operator) {
            require(block.timestamp >= job.submittedAt + TIMEOUT, "timeout");
        } else {
            revert("caller");
        }
        job.state = State.Accepted;
        token.safeTransfer(job.operator, job.reward);
        emit ResultAccepted(jobId, msg.sender);
    }

    /// @notice Accept the job result and release payment.
    /// Employer may call any time after submission. Operator may call after timeout.
    /// @param jobId Identifier of the job.
    function acceptResult(uint256 jobId) external {
        _accept(jobId);
    }

    /// @notice Acknowledge the tax policy and accept the job result in one call.
    /// @param jobId Identifier of the job.
    function acknowledgeAndAcceptResult(uint256 jobId) external {
        address registry = jobRegistry;
        if (registry != address(0)) {
            IJobRegistryAck(registry).acknowledgeFor(msg.sender);
        }
        _accept(jobId);
    }

    /// @notice Confirms this contract and its owner remain tax neutral.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Reject direct ETH transfers to keep the escrow token-only.
    receive() external payable {
        revert("JobEscrow: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("JobEscrow: no ether");
    }
}

