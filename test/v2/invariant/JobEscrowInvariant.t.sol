// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/StdInvariant.sol";
import "forge-std/Test.sol";
import "forge-std/Vm.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {JobEscrow, IRoutingModule} from "../../../contracts/v2/modules/JobEscrow.sol";
import {AGIALPHAToken} from "../../../contracts/test/AGIALPHAToken.sol";
import {AGIALPHA} from "../../../contracts/v2/Constants.sol";

contract DeterministicRoutingModule is IRoutingModule {
    address[] public operators;
    uint256 public counter;

    constructor(address[] memory _operators) {
        operators = _operators;
    }

    function selectOperator(bytes32, bytes32 seed) external override returns (address) {
        counter++;
        uint256 len = operators.length;
        if (len == 0) {
            return address(0);
        }
        return operators[uint256(seed) % len];
    }
}

contract JobEscrowHandler {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant MIN_REWARD = 0.1e18;
    uint256 internal constant MAX_REWARD = 5_000e18;

    JobEscrow public immutable escrow;
    AGIALPHAToken public immutable token;
    address public immutable tokenOwner;

    address[] public employers;
    uint256[] public jobIds;
    uint256 public jobsCreated;

    constructor(JobEscrow _escrow, AGIALPHAToken _token, address _tokenOwner) {
        escrow = _escrow;
        token = _token;
        tokenOwner = _tokenOwner;

        employers.push(address(0xA11CE));
        employers.push(address(0xB0B));
        employers.push(address(0xC0FFEE));

    }

    function postJob(uint8 employerSeed, uint96 rewardSeed, bytes32 routeSeed) external {
        address employer = employers[employerSeed % employers.length];
        uint256 reward = MIN_REWARD + (uint256(rewardSeed) % MAX_REWARD);

        vm.startPrank(tokenOwner);
        token.mint(employer, reward);
        vm.stopPrank();

        vm.startPrank(employer);
        token.approve(address(escrow), reward);
        uint256 jobId = escrow.postJob(reward, _jobData(routeSeed), routeSeed);
        vm.stopPrank();

        jobIds.push(jobId);
        jobsCreated++;
    }

    function submitResult(uint8 jobSeed, bytes32 payloadSeed) external {
        if (jobIds.length == 0) return;
        uint256 jobId = jobIds[jobSeed % jobIds.length];
        (address employer, address operator,, JobEscrow.State state,,,) = escrow.jobs(jobId);
        if (state != JobEscrow.State.Posted) return;

        string memory result = _resultData(jobId, payloadSeed);
        vm.startPrank(operator);
        escrow.submitResult(jobId, result);
        vm.stopPrank();
        _acknowledge(employer);
    }

    function employerAccept(uint8 jobSeed) external {
        if (jobIds.length == 0) return;
        uint256 jobId = jobIds[jobSeed % jobIds.length];
        (address employer,, , JobEscrow.State state,,,) = escrow.jobs(jobId);
        if (state != JobEscrow.State.Submitted) return;

        _acknowledge(address(escrow));
        vm.startPrank(employer);
        escrow.acceptResult(jobId);
        vm.stopPrank();
        _acknowledge(employer);
    }

    function operatorAccept(uint8 jobSeed) external {
        if (jobIds.length == 0) return;
        uint256 jobId = jobIds[jobSeed % jobIds.length];
        (, address operator,, JobEscrow.State state, uint256 submittedAt,,) = escrow.jobs(jobId);
        if (state != JobEscrow.State.Submitted) return;

        uint256 timeout = escrow.resultTimeout();
        vm.warp(submittedAt + timeout + 1);
        _acknowledge(address(escrow));
        vm.startPrank(operator);
        escrow.acceptResult(jobId);
        vm.stopPrank();
    }

    function cancelJob(uint8 jobSeed) external {
        if (jobIds.length == 0) return;
        uint256 jobId = jobIds[jobSeed % jobIds.length];
        (address employer,, , JobEscrow.State state,,,) = escrow.jobs(jobId);
        if (state != JobEscrow.State.Posted) return;

        vm.startPrank(employer);
        escrow.cancelJob(jobId);
        vm.stopPrank();
    }

    function outstandingEscrow() external view returns (uint256 total) {
        uint256 len = jobIds.length;
        for (uint256 i; i < len; ++i) {
            uint256 jobId = jobIds[i];
            (, , uint256 reward, JobEscrow.State state,,,) = escrow.jobs(jobId);
            if (state == JobEscrow.State.Posted || state == JobEscrow.State.Submitted) {
                total += reward;
            }
        }
    }

    function totalJobsCreated() external view returns (uint256) {
        return jobsCreated;
    }

    function _jobData(bytes32 seed) internal pure returns (string memory) {
        return string.concat("spec://", Strings.toHexString(uint256(seed)));
    }

    function _resultData(uint256 jobId, bytes32 seed) internal pure returns (string memory) {
        return string.concat("result://", Strings.toString(jobId), "-", Strings.toHexString(uint256(seed)));
    }

    function _acknowledge(address who) internal {
        if (!token.hasAcknowledged(who)) {
            vm.prank(who);
            token.acceptTerms();
        }
    }
}

contract JobEscrowInvariant is StdInvariant, Test {
    JobEscrow public escrow;
    AGIALPHAToken public token;
    DeterministicRoutingModule public routing;
    JobEscrowHandler public handler;

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        vm.store(AGIALPHA, bytes32(uint256(5)), bytes32(uint256(uint160(address(this)))));
        token = AGIALPHAToken(payable(AGIALPHA));

        address[] memory operators = new address[](3);
        operators[0] = address(0xDEF1);
        operators[1] = address(0xC0FFEE);
        operators[2] = address(0xBEEF);
        routing = new DeterministicRoutingModule(operators);

        escrow = new JobEscrow(routing);
        handler = new JobEscrowHandler(escrow, token, address(this));
        escrow.setRoutingModule(routing);

        vm.prank(address(escrow));
        token.acceptTerms();

        targetContract(address(handler));
    }

    function invariant_escrowBackedByTokenBalance() public view {
        uint256 tracked = handler.outstandingEscrow();
        uint256 balance = token.balanceOf(address(escrow));
        assertEq(balance, tracked, "escrow token balance mismatch");
    }

    function invariant_jobIdAccountingMatches() public view {
        assertEq(escrow.nextJobId(), handler.totalJobsCreated(), "unexpected job id drift");
    }
}

contract JobEscrowInvariantSmoke is Test {
    JobEscrow public escrow;
    AGIALPHAToken public token;
    DeterministicRoutingModule public routing;
    JobEscrowHandler public handler;

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        vm.store(AGIALPHA, bytes32(uint256(5)), bytes32(uint256(uint160(address(this)))));
        token = AGIALPHAToken(payable(AGIALPHA));

        address[] memory operators = new address[](3);
        operators[0] = address(0xDEF1);
        operators[1] = address(0xC0FFEE);
        operators[2] = address(0xBEEF);
        routing = new DeterministicRoutingModule(operators);

        escrow = new JobEscrow(routing);
        handler = new JobEscrowHandler(escrow, token, address(this));
        escrow.setRoutingModule(routing);

        vm.prank(address(escrow));
        token.acceptTerms();
    }

    function testEscrowBalanceMatchesOutstandingAfterLifecycle() public {
        handler.postJob(0, 1, keccak256("job-seed"));
        handler.submitResult(0, keccak256("payload"));

        uint256 balance = token.balanceOf(address(escrow));
        assertEq(balance, handler.outstandingEscrow(), "escrow balance drifted");

        assertEq(escrow.nextJobId(), handler.totalJobsCreated(), "job counter mismatch");
    }
}
