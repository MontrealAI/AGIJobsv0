// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IFeePool} from "./IFeePool.sol";

/// @title IStakeManagerControl
/// @notice Minimal administrative surface for StakeManager controls consumed by
///         the HGM control module.
interface IStakeManagerControl {
    function setPauserManager(address manager) external;

    function setFeePct(uint256 pct) external;

    function setBurnPct(uint256 pct) external;

    function setValidatorRewardPct(uint256 pct) external;

    function setMinStake(uint256 minStake) external;

    function setMaxStakePerAddress(uint256 maxStake) external;

    function setUnbondingPeriod(uint256 period) external;

    function setTreasury(address treasury) external;

    function setTreasuryAllowlist(address treasury, bool allowed) external;

    function setFeePool(IFeePool pool) external;
}
