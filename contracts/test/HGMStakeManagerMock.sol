// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IStakeManagerControl} from "../v2/interfaces/IStakeManagerControl.sol";
import {IFeePool} from "../v2/interfaces/IFeePool.sol";

contract HGMStakeManagerMock is IStakeManagerControl {
    address public pauserManager;
    uint256 public feePct;
    uint256 public burnPct;
    uint256 public validatorRewardPct;
    uint256 public minStake;
    uint256 public maxStakePerAddress;
    uint256 public unbondingPeriod;
    IFeePool public feePool;
    address public treasury;
    mapping(address => bool) public treasuryAllowlist;

    function setPauserManager(address manager) external override {
        pauserManager = manager;
    }

    function setFeePct(uint256 pct) external override {
        feePct = pct;
    }

    function setBurnPct(uint256 pct) external override {
        burnPct = pct;
    }

    function setValidatorRewardPct(uint256 pct) external override {
        validatorRewardPct = pct;
    }

    function setMinStake(uint256 _minStake) external override {
        minStake = _minStake;
    }

    function setMaxStakePerAddress(uint256 maxStake) external override {
        maxStakePerAddress = maxStake;
    }

    function setUnbondingPeriod(uint256 period) external override {
        unbondingPeriod = period;
    }

    function setTreasury(address _treasury) external override {
        treasury = _treasury;
    }

    function setTreasuryAllowlist(address addr, bool allowed) external override {
        treasuryAllowlist[addr] = allowed;
    }

    function setFeePool(IFeePool pool) external override {
        feePool = pool;
    }
}
