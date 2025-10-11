// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/StdInvariant.sol";
import "forge-std/Test.sol";
import "forge-std/Vm.sol";

import {SystemPause} from "../../../contracts/v2/SystemPause.sol";
import {Governable} from "../../../contracts/v2/Governable.sol";
import {JobRegistry} from "../../../contracts/v2/JobRegistry.sol";
import {StakeManager} from "../../../contracts/v2/StakeManager.sol";
import {ValidationModule} from "../../../contracts/v2/ValidationModule.sol";
import {DisputeModule} from "../../../contracts/v2/modules/DisputeModule.sol";
import {PlatformRegistry} from "../../../contracts/v2/PlatformRegistry.sol";
import {FeePool} from "../../../contracts/v2/FeePool.sol";
import {ReputationEngine} from "../../../contracts/v2/ReputationEngine.sol";
import {ArbitratorCommittee} from "../../../contracts/v2/ArbitratorCommittee.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract MockManagedModule {
    error UnauthorizedOwner();
    error UnauthorizedPauserManager();
    error UnauthorizedPauser();
    error InvalidAddress();

    address private _owner;
    address private _pauserManager;
    address private _pauser;

    bool private _paused;
    uint256 private _configValue;
    address private _lastUpdater;

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress();
        _owner = initialOwner;
        _pauserManager = initialOwner;
        _pauser = initialOwner;
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != _owner) revert UnauthorizedOwner();
        if (newOwner == address(0)) revert InvalidAddress();
        _owner = newOwner;
    }

    function setPauserManager(address newManager) external {
        if (msg.sender != _owner) revert UnauthorizedOwner();
        if (newManager == address(0)) revert InvalidAddress();
        _pauserManager = newManager;
    }

    function setPauser(address newPauser) external {
        if (msg.sender != _pauserManager) revert UnauthorizedPauserManager();
        if (newPauser == address(0)) revert InvalidAddress();
        _pauser = newPauser;
    }

    function pause() external {
        if (msg.sender != _pauser && msg.sender != _owner) revert UnauthorizedPauser();
        _paused = true;
    }

    function unpause() external {
        if (msg.sender != _pauser && msg.sender != _owner) revert UnauthorizedPauser();
        _paused = false;
    }

    function governanceUpdate(uint256 newValue) external {
        if (msg.sender != _owner) revert UnauthorizedOwner();
        _configValue = newValue;
        _lastUpdater = msg.sender;
    }

    function owner() external view returns (address) {
        return _owner;
    }

    function pauserManager() external view returns (address) {
        return _pauserManager;
    }

    function pauser() external view returns (address) {
        return _pauser;
    }

    function paused() external view returns (bool) {
        return _paused;
    }

    function configValue() external view returns (uint256) {
        return _configValue;
    }

    function lastUpdater() external view returns (address) {
        return _lastUpdater;
    }
}

contract SystemPauseInvariantHandler {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    SystemPause public immutable systemPause;
    TimelockController public immutable governance;
    MockManagedModule[] public modules;

    constructor(
        SystemPause _systemPause,
        TimelockController _governance,
        MockManagedModule[] memory _modules
    ) {
        systemPause = _systemPause;
        governance = _governance;
        modules = _modules;
    }

    function setGlobalPauser(uint160 rawPauser) external {
        address pauser = address(uint160(rawPauser) | 0x1);
        vm.prank(address(governance));
        systemPause.setGlobalPauser(pauser);
    }

    function refreshPausers() external {
        vm.prank(address(governance));
        systemPause.refreshPausers();
    }

    function pauseAll() external {
        vm.prank(address(governance));
        systemPause.pauseAll();
    }

    function unpauseAll() external {
        vm.prank(address(governance));
        systemPause.unpauseAll();
    }

    function executeGovernance(uint8 moduleIndex, uint256 newValue) external {
        MockManagedModule target = modules[moduleIndex % modules.length];
        vm.prank(address(governance));
        systemPause.executeGovernanceCall(
            address(target),
            abi.encodeWithSelector(MockManagedModule.governanceUpdate.selector, newValue)
        );
    }

    function trySetGlobalPauserZero() external {
        vm.expectRevert(SystemPause.InvalidPauser.selector);
        vm.prank(address(governance));
        systemPause.setGlobalPauser(address(0));
    }

    function tryUnauthorizedSetGlobalPauser(address caller, uint160 rawPauser) external {
        vm.assume(caller != address(governance));
        address pauser = address(uint160(rawPauser) | 0x1);
        vm.expectRevert(Governable.NotGovernance.selector);
        vm.prank(caller);
        systemPause.setGlobalPauser(pauser);
    }

    function tryUnauthorizedPause(address caller) external {
        vm.assume(caller != address(governance));
        vm.expectRevert(Governable.NotGovernance.selector);
        vm.prank(caller);
        systemPause.pauseAll();
    }

    function tryUnauthorizedExecute(uint8 moduleIndex, uint256 newValue, address caller) external {
        vm.assume(caller != address(governance));
        MockManagedModule target = modules[moduleIndex % modules.length];
        vm.expectRevert(Governable.NotGovernance.selector);
        vm.prank(caller);
        systemPause.executeGovernanceCall(
            address(target),
            abi.encodeWithSelector(MockManagedModule.governanceUpdate.selector, newValue)
        );
    }

    function tryExecuteUnknownTarget(uint256 newValue) external {
        address unknown = address(0xdeadbeef);
        vm.expectRevert(SystemPause.UnknownGovernanceTarget.selector);
        vm.prank(address(governance));
        systemPause.executeGovernanceCall(
            unknown,
            abi.encodeWithSelector(MockManagedModule.governanceUpdate.selector, newValue)
        );
    }

    function tryExecuteMissingSelector() external {
        vm.expectRevert(SystemPause.MissingSelector.selector);
        vm.prank(address(governance));
        systemPause.executeGovernanceCall(address(modules[0]), "");
    }
}

contract SystemPauseControlInvariantTest is StdInvariant, Test {
    SystemPause public systemPause;
    TimelockController public governance;
    MockManagedModule[] internal modules;
    SystemPauseInvariantHandler internal handler;

    function setUp() public {
        address[] memory proposers = new address[](1);
        proposers[0] = address(this);
        address[] memory executors = new address[](1);
        executors[0] = address(this);
        governance = new TimelockController(0, proposers, executors, address(this));

        modules = new MockManagedModule[](8);
        for (uint256 i = 0; i < modules.length; ++i) {
            modules[i] = new MockManagedModule(address(governance));
        }

        systemPause = new SystemPause(
            JobRegistry(payable(address(modules[0]))),
            StakeManager(payable(address(modules[1]))),
            ValidationModule(payable(address(modules[2]))),
            DisputeModule(payable(address(modules[3]))),
            PlatformRegistry(payable(address(modules[4]))),
            FeePool(payable(address(modules[5]))),
            ReputationEngine(payable(address(modules[6]))),
            ArbitratorCommittee(payable(address(modules[7]))),
            address(governance)
        );

        for (uint256 i = 0; i < modules.length; ++i) {
            vm.prank(address(governance));
            modules[i].transferOwnership(address(systemPause));
        }

        vm.prank(address(governance));
        systemPause.refreshPausers();

        MockManagedModule[] memory handlerModules = new MockManagedModule[](modules.length);
        for (uint256 i = 0; i < modules.length; ++i) {
            handlerModules[i] = modules[i];
        }

        handler = new SystemPauseInvariantHandler(systemPause, governance, handlerModules);
        targetContract(address(handler));
    }

    function invariant_activePauserPropagates() public view {
        address activePauser = systemPause.activePauser();
        for (uint256 i = 0; i < modules.length; ++i) {
            assertEq(modules[i].pauser(), activePauser, "module pauser drifted");
        }
    }

    function invariant_pauserManagerDelegated() public view {
        for (uint256 i = 0; i < modules.length; ++i) {
            assertEq(modules[i].pauserManager(), address(systemPause), "pauser manager not delegated");
        }
    }

    function invariant_ownerRetained() public view {
        for (uint256 i = 0; i < modules.length; ++i) {
            assertEq(modules[i].owner(), address(systemPause), "module ownership drifted");
        }
    }

    function invariant_pauseStateUniform() public view {
        bool pausedReference = modules[0].paused();
        for (uint256 i = 1; i < modules.length; ++i) {
            assertEq(modules[i].paused(), pausedReference, "pause state diverged");
        }
    }

    function invariant_governanceUpdatesOnlyThroughSystemPause() public view {
        for (uint256 i = 0; i < modules.length; ++i) {
            address last = modules[i].lastUpdater();
            if (last != address(0)) {
                assertEq(last, address(systemPause), "unexpected updater recorded");
            }
        }
    }
}
