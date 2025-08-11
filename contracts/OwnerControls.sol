// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title OwnerControls
/// @notice Stores system level configuration parameters controllable by the owner
contract OwnerControls is Ownable {
    uint256 public minStake;
    uint256 public feePercent;
    string public routingAlgo;
    uint256 public disputeBond;

    address public jobRegistry;
    address public stakeManager;
    address public validationModule;
    address public reputationEngine;
    address public certificateNFT;
    address public disputeModule;

    event MinStakeUpdated(uint256 newMinStake);
    event FeePercentUpdated(uint256 newFeePercent);
    event RoutingAlgoUpdated(string newRoutingAlgo);
    event DisputeBondUpdated(uint256 newDisputeBond);
    event JobRegistryUpdated(address newAddress);
    event StakeManagerUpdated(address newAddress);
    event ValidationModuleUpdated(address newAddress);
    event ReputationEngineUpdated(address newAddress);
    event CertificateNFTUpdated(address newAddress);
    event DisputeModuleUpdated(address newAddress);

    constructor(address owner) Ownable(owner) {}

    function setMinStake(uint256 newMinStake) external onlyOwner {
        minStake = newMinStake;
        emit MinStakeUpdated(newMinStake);
    }

    function setFeePercent(uint256 newFeePercent) external onlyOwner {
        feePercent = newFeePercent;
        emit FeePercentUpdated(newFeePercent);
    }

    function setRoutingAlgo(string calldata newRoutingAlgo) external onlyOwner {
        routingAlgo = newRoutingAlgo;
        emit RoutingAlgoUpdated(newRoutingAlgo);
    }

    function setDisputeBond(uint256 newDisputeBond) external onlyOwner {
        disputeBond = newDisputeBond;
        emit DisputeBondUpdated(newDisputeBond);
    }

    function setJobRegistry(address newAddress) external onlyOwner {
        jobRegistry = newAddress;
        emit JobRegistryUpdated(newAddress);
    }

    function setStakeManager(address newAddress) external onlyOwner {
        stakeManager = newAddress;
        emit StakeManagerUpdated(newAddress);
    }

    function setValidationModule(address newAddress) external onlyOwner {
        validationModule = newAddress;
        emit ValidationModuleUpdated(newAddress);
    }

    function setReputationEngine(address newAddress) external onlyOwner {
        reputationEngine = newAddress;
        emit ReputationEngineUpdated(newAddress);
    }

    function setCertificateNFT(address newAddress) external onlyOwner {
        certificateNFT = newAddress;
        emit CertificateNFTUpdated(newAddress);
    }

    function setDisputeModule(address newAddress) external onlyOwner {
        disputeModule = newAddress;
        emit DisputeModuleUpdated(newAddress);
    }
}

