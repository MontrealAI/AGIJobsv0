// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IDomainRegistry {
    struct DomainView {
        string name;
        string slug;
        string metadataURI;
        bytes32 credentialSchema;
        bytes32 l2Network;
        address dispatcher;
        address oracle;
        address bridge;
        address l2Gateway;
        uint96 minStake;
        uint32 resilienceFloor;
        uint32 maxConcurrentJobs;
        bool requiresHumanReview;
        bool active;
        bool paused;
    }

    function isActive(uint256 domainId) external view returns (bool);

    function domainExists(uint256 domainId) external view returns (bool);

    function getDomain(uint256 domainId) external view returns (DomainView memory);

    function paused() external view returns (bool);
}
