// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IJobRegistryAck} from "./interfaces/IJobRegistryAck.sol";

interface IReputationEngine {
    function reputation(address user) external view returns (uint256);
    function isBlacklisted(address user) external view returns (bool);
    function stakeWeight() external view returns (uint256);
    function reputationWeight() external view returns (uint256);
}

/// @title PlatformRegistry
/// @notice Registers platform operators that stake $AGIALPHA and exposes
///         reputation-weighted scores for job routing and discovery.
/// @dev Holds no tokens and rejects ether to remain tax neutral. All values
///      use 6 decimals via the `StakeManager`.
contract PlatformRegistry is Ownable, ReentrancyGuard {
    uint256 public constant DEFAULT_MIN_PLATFORM_STAKE = 1e6;

    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    uint256 public minPlatformStake;
    mapping(address => bool) public registered;
    mapping(address => bool) public blacklist;
    mapping(address => bool) public registrars;

    event Registered(address indexed operator);
    event Deregistered(address indexed operator);
    event StakeManagerUpdated(address indexed stakeManager);
    event ReputationEngineUpdated(address indexed engine);
    event ModulesUpdated(address indexed stakeManager, address indexed reputationEngine);
    event MinPlatformStakeUpdated(uint256 stake);
    event Blacklisted(address indexed operator, bool status);
    event RegistrarUpdated(address indexed registrar, bool allowed);
    event Activated(address indexed operator, uint256 amount);

    /// @notice Deploys the PlatformRegistry.
    /// @param _stakeManager StakeManager contract.
    /// @param _reputationEngine Reputation engine used for scoring.
    /// @param _minStake Minimum stake required for platforms to register.
    /// Defaults to DEFAULT_MIN_PLATFORM_STAKE when set to zero.
    constructor(
        IStakeManager _stakeManager,
        IReputationEngine _reputationEngine,
        uint256 _minStake
    ) Ownable(msg.sender) {
        stakeManager = _stakeManager;
        if (address(_stakeManager) != address(0)) {
            emit StakeManagerUpdated(address(_stakeManager));
        }

        reputationEngine = _reputationEngine;
        if (address(_reputationEngine) != address(0)) {
            emit ReputationEngineUpdated(address(_reputationEngine));
        }

        if (
            address(_stakeManager) != address(0) ||
            address(_reputationEngine) != address(0)
        ) {
            emit ModulesUpdated(
                address(_stakeManager),
                address(_reputationEngine)
            );
        }

        minPlatformStake =
            _minStake == 0 ? DEFAULT_MIN_PLATFORM_STAKE : _minStake;
        emit MinPlatformStakeUpdated(minPlatformStake);
    }

    function _register(address operator) internal {
        require(!registered[operator], "registered");
        require(!blacklist[operator], "blacklisted");
        uint256 stake = stakeManager.stakeOf(operator, IStakeManager.Role.Platform);
        if (operator != owner()) {
            require(stake >= minPlatformStake, "stake");
        }
        registered[operator] = true;
        emit Registered(operator);
    }

    /// @notice Register caller as a platform operator.
    function register() external nonReentrant {
        _register(msg.sender);
    }

    /// @notice Remove caller from the registry.
    function deregister() external nonReentrant {
        require(registered[msg.sender], "not registered");
        registered[msg.sender] = false;
        emit Deregistered(msg.sender);
    }

    /**
     * @notice Deposit $AGIALPHA stake and register the caller in one step.
     * @dev Caller must `approve` the `StakeManager` for at least `amount` tokens
     *      beforehand. Uses 6-decimal base units.
     * @param amount Stake amount in $AGIALPHA with 6 decimals.
     */
    function stakeAndRegister(uint256 amount) external nonReentrant {
        require(!registered[msg.sender], "registered");
        require(!blacklist[msg.sender], "blacklisted");
        stakeManager.depositStakeFor(
            msg.sender,
            IStakeManager.Role.Platform,
            amount
        );
        _register(msg.sender);
        emit Activated(msg.sender, amount);
    }

    /**
     * @notice Register the caller after acknowledging the tax policy when
     *         necessary.
     * @dev Assumes the caller has already staked the required $AGIALPHA via the
     *      `StakeManager`, which uses 6-decimal base units and requires prior
     *      token `approve` calls. Invoking this helper implicitly accepts the
     *      current tax policy if it has not been acknowledged yet.
     */
    function acknowledgeAndRegister() external nonReentrant {
        address registry = stakeManager.jobRegistry();
        if (registry != address(0)) {
            IJobRegistryAck(registry).acknowledgeFor(msg.sender);
        }
        _register(msg.sender);
    }

    /**
     * @notice Acknowledge the tax policy, stake $AGIALPHA, and register.
     * @dev Caller must `approve` the `StakeManager` for at least `amount` tokens
     *      beforehand. Uses 6-decimal base units. Invoking this helper
     *      implicitly accepts the current tax policy if it has not been
     *      acknowledged yet.
     * @param amount Stake amount in $AGIALPHA with 6 decimals.
     */
    function acknowledgeStakeAndRegister(uint256 amount) external nonReentrant {
        require(!registered[msg.sender], "registered");
        require(!blacklist[msg.sender], "blacklisted");
        address registry = stakeManager.jobRegistry();
        if (registry != address(0)) {
            IJobRegistryAck(registry).acknowledgeFor(msg.sender);
        }
        stakeManager.depositStakeFor(
            msg.sender,
            IStakeManager.Role.Platform,
            amount
        );
        _register(msg.sender);
        emit Activated(msg.sender, amount);
    }

    /**
     * @notice Deregister the caller after acknowledging the tax policy.
     * @dev Invoking this helper implicitly accepts the current tax policy via
     *      the associated `JobRegistry` when set.
     */
    function acknowledgeAndDeregister() external nonReentrant {
        require(registered[msg.sender], "not registered");
        address registry = stakeManager.jobRegistry();
        if (registry != address(0)) {
            IJobRegistryAck(registry).acknowledgeFor(msg.sender);
        }
        registered[msg.sender] = false;
        emit Deregistered(msg.sender);
    }

    /// @notice Register an operator on their behalf.
    function registerFor(address operator) external nonReentrant {
        if (msg.sender != operator) {
            require(registrars[msg.sender], "registrar");
        }
        _register(operator);
    }

    /**
     * @notice Register an operator after acknowledging the tax policy on their
     *         behalf.
     * @dev The operator must already have the minimum stake recorded in
     *      6-decimal $AGIALPHA units within the `StakeManager`, requiring a
     *      prior token `approve`. Calling this helper implicitly acknowledges
     *      the tax policy for the operator if needed.
     * @param operator Address to be registered.
     */
    function acknowledgeAndRegisterFor(address operator) external nonReentrant {
        if (msg.sender != operator) {
            require(registrars[msg.sender], "registrar");
        }
        address registry = stakeManager.jobRegistry();
        if (registry != address(0)) {
            IJobRegistryAck(registry).acknowledgeFor(operator);
        }
        _register(operator);
    }

    /**
     * @notice Acknowledge the tax policy, stake $AGIALPHA, and register an operator.
     * @dev Caller must `approve` the `StakeManager` for at least `amount` tokens
     *      beforehand. Uses 6-decimal base units. Invoking this helper
     *      implicitly accepts the current tax policy for the operator if it has
     *      not been acknowledged yet.
     * @param operator Address to be registered.
     * @param amount Stake amount in $AGIALPHA with 6 decimals.
     */
    function acknowledgeStakeAndRegisterFor(
        address operator,
        uint256 amount
    ) external nonReentrant {
        if (msg.sender != operator) {
            require(registrars[msg.sender], "registrar");
        }
        require(!registered[operator], "registered");
        require(!blacklist[operator], "blacklisted");
        address registry = stakeManager.jobRegistry();
        if (registry != address(0)) {
            IJobRegistryAck(registry).acknowledgeFor(operator);
        }
        stakeManager.depositStakeFor(
            operator,
            IStakeManager.Role.Platform,
            amount
        );
        _register(operator);
        emit Activated(operator, amount);
    }

    /// @notice Retrieve routing score for a platform based on stake and reputation.
    function getScore(address operator) public view returns (uint256) {
        if (blacklist[operator] || reputationEngine.isBlacklisted(operator)) return 0;
        uint256 stake = stakeManager.stakeOf(operator, IStakeManager.Role.Platform);
        // Deployer may register without staking but receives no routing boost.
        if (operator == owner() && stake == 0) return 0;
        uint256 rep = reputationEngine.reputation(operator);
        uint256 stakeW = reputationEngine.stakeWeight();
        uint256 repW = reputationEngine.reputationWeight();
        return ((stake * stakeW) + (rep * repW)) / 1e18;
    }

    // ---------------------------------------------------------------
    // Owner functions
    // ---------------------------------------------------------------

    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
    }

    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    function setMinPlatformStake(uint256 stake) external onlyOwner {
        minPlatformStake = stake;
        emit MinPlatformStakeUpdated(stake);
    }

    function setBlacklist(address operator, bool status) external onlyOwner {
        blacklist[operator] = status;
        emit Blacklisted(operator, status);
    }

    /// @notice Authorize or revoke a registrar address.
    function setRegistrar(address registrar, bool allowed) external onlyOwner {
        registrars[registrar] = allowed;
        emit RegistrarUpdated(registrar, allowed);
    }

    /// @notice Confirms the contract and owner are perpetually tax neutral.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    receive() external payable {
        revert("PlatformRegistry: no ether");
    }

    fallback() external payable {
        revert("PlatformRegistry: no ether");
    }
}

