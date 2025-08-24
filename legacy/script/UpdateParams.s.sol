// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import {JobRegistry} from "contracts/v2/JobRegistry.sol";
import {ValidationModule} from "contracts/v2/ValidationModule.sol";

contract UpdateParams is Script {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        bytes32 agentRoot;
        bytes32 clubRoot;
        bytes32 agentMerkle;
        bytes32 validatorMerkle;
        try vm.envBytes32("AGENT_ROOT") returns (bytes32 v) {
            agentRoot = v;
        } catch {}
        try vm.envBytes32("CLUB_ROOT") returns (bytes32 v2) {
            clubRoot = v2;
        } catch {}
        try vm.envBytes32("AGENT_MERKLE_ROOT") returns (bytes32 v3) {
            agentMerkle = v3;
        } catch {}
        try vm.envBytes32("VALIDATOR_MERKLE_ROOT") returns (bytes32 v4) {
            validatorMerkle = v4;
        } catch {}

        string memory path = string.concat(vm.projectRoot(), "/docs/deployment-addresses.json");
        string memory json = vm.readFile(path);
        address registryAddr = vm.parseJsonAddress(json, ".jobRegistry");
        address validationAddr = vm.parseJsonAddress(json, ".validationModule");

        vm.startBroadcast(key);

        if (agentRoot != bytes32(0) || clubRoot != bytes32(0)) {
            JobRegistry(registryAddr).setRootNodes(agentRoot, clubRoot);
            ValidationModule(validationAddr).setRootNodes(agentRoot, clubRoot);
        }
        if (agentMerkle != bytes32(0) || validatorMerkle != bytes32(0)) {
            JobRegistry(registryAddr).setMerkleRoots(
                agentMerkle,
                validatorMerkle
            );
            ValidationModule(validationAddr).setMerkleRoots(
                agentMerkle,
                validatorMerkle
            );
        }

        vm.stopBroadcast();
    }
}
