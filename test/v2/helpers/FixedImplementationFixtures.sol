// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ImplementationArtifactLoader {
    function getCode(string calldata artifact) external returns (bytes memory);
}

/// @dev Foundry-only deployment helper. Loads compiled implementations without embedding their code in tests.
library FixedImplementationFixtures {
    function deploy(string memory controller, string memory group) private returns (address implementation) {
        string memory name = string.concat(controller, group);
        bytes memory code = ImplementationArtifactLoader(address(uint160(uint256(keccak256("hevm cheat code")))))
            .getCode(string.concat(name, ".sol:", name));
        assembly ("memory-safe") { implementation := create(0, add(code, 0x20), mload(code)) }
        require(implementation != address(0), "implementation deployment failed");
    }

    function jobRegistry() internal returns (address[3] memory) {
        return [
            deploy("JobRegistry", "Configuration"),
            deploy("JobRegistry", "Lifecycle"),
            deploy("JobRegistry", "Settlement")
        ];
    }

    function stakeManager() internal returns (address[4] memory) {
        return [
            deploy("StakeManager", "Configuration"),
            deploy("StakeManager", "Staking"),
            deploy("StakeManager", "Escrow"),
            deploy("StakeManager", "Slashing")
        ];
    }

    function validationModule() internal returns (address[3] memory) {
        return [
            deploy("ValidationModule", "Configuration"),
            deploy("ValidationModule", "Voting"),
            deploy("ValidationModule", "Selection")
        ];
    }
}
