// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import {AGIALPHAToken} from "contracts/v2/AGIALPHAToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StakeManager} from "contracts/v2/StakeManager.sol";
import {JobRegistry} from "contracts/v2/JobRegistry.sol";
import {ValidationModule} from "contracts/v2/ValidationModule.sol";
import {ReputationEngine} from "contracts/v2/ReputationEngine.sol";
import {DisputeModule} from "contracts/v2/DisputeModule.sol";
import {CertificateNFT} from "contracts/v2/modules/CertificateNFT.sol";
import {FeePool} from "contracts/v2/FeePool.sol";
import {PlatformRegistry} from "contracts/v2/PlatformRegistry.sol";
import {TaxPolicy} from "contracts/v2/TaxPolicy.sol";
import {RevenueDistributor} from "contracts/v2/modules/RevenueDistributor.sol";

contract DeployAll is Script {
    function run() external {
        uint256 deployer = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployer);

        AGIALPHAToken token = new AGIALPHAToken(vm.addr(deployer));
        token.mint(vm.addr(deployer), 1_000_000e6);

        StakeManager stake = new StakeManager(
            IERC20(address(token)),
            vm.addr(deployer),
            vm.addr(deployer)
        );

        JobRegistry registry = new JobRegistry(vm.addr(deployer));

        TaxPolicy tax = new TaxPolicy(
            vm.addr(deployer),
            "ipfs://policy",
            "All taxes on participants; contract and owner exempt"
        );
        registry.setTaxPolicy(tax);

        ValidationModule validation = new ValidationModule(
            registry,
            stake,
            vm.addr(deployer)
        );

        ReputationEngine reputation = new ReputationEngine(vm.addr(deployer));
        CertificateNFT nft = new CertificateNFT("Cert", "CERT", vm.addr(deployer));
        DisputeModule dispute = new DisputeModule(registry, vm.addr(deployer));

        FeePool feePool = new FeePool(
            IERC20(address(token)),
            stake,
            StakeManager.Role.Platform,
            vm.addr(deployer)
        );

        RevenueDistributor distributor = new RevenueDistributor(
            stake,
            vm.addr(deployer)
        );

        PlatformRegistry platformRegistry = new PlatformRegistry(
            stake,
            reputation,
            1_000e6,
            vm.addr(deployer)
        );

        stake.setJobRegistry(address(registry));
        registry.setModules(validation, stake, reputation, dispute, nft);
        registry.setFeePool(feePool);
        registry.setFeePct(5);

        vm.stopBroadcast();
    }
}

