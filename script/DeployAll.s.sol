// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import {AGIALPHAToken} from "contracts/v2/AGIALPHAToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StakeManager} from "contracts/v2/StakeManager.sol";
import {JobRegistry} from "contracts/v2/JobRegistry.sol";
import {ValidationModule} from "contracts/v2/ValidationModule.sol";
import {ReputationEngine} from "contracts/v2/ReputationEngine.sol";
import {DisputeModule} from "contracts/v2/modules/DisputeModule.sol";
import {CertificateNFT} from "contracts/v2/modules/CertificateNFT.sol";
import {ICertificateNFT} from "contracts/v2/interfaces/ICertificateNFT.sol";
import {FeePool} from "contracts/v2/FeePool.sol";
import {PlatformRegistry} from "contracts/v2/PlatformRegistry.sol";
import {IStakeManager} from "contracts/v2/interfaces/IStakeManager.sol";
import {IReputationEngine} from "contracts/v2/interfaces/IReputationEngine.sol";
import {IFeePool} from "contracts/v2/interfaces/IFeePool.sol";
import {IValidationModule} from "contracts/v2/interfaces/IValidationModule.sol";
import {IDisputeModule} from "contracts/v2/interfaces/IDisputeModule.sol";
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
            0,
            0,
            0,
            vm.addr(deployer),
            address(0),
            address(0)
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
            1 days,
            1 days,
            1,
            3,
            new address[](0)
        );

        ReputationEngine reputation = new ReputationEngine(
            IStakeManager(address(stake))
        );
        CertificateNFT nft = new CertificateNFT("Cert", "CERT", vm.addr(deployer));
        DisputeModule dispute = new DisputeModule(registry, 0, 0, address(0));

        FeePool feePool = new FeePool(
            IERC20(address(token)),
            IStakeManager(address(stake)),
            0,
            vm.addr(deployer)
        );

        RevenueDistributor distributor = new RevenueDistributor(
            stake,
            vm.addr(deployer)
        );

        PlatformRegistry platformRegistry = new PlatformRegistry(
            IStakeManager(address(stake)),
            IReputationEngine(address(reputation)),
            1_000e6,
            vm.addr(deployer)
        );

        stake.setJobRegistry(address(registry));
        registry.setModules(
            validation,
            stake,
            IReputationEngine(address(reputation)),
            IDisputeModule(address(dispute)),
            ICertificateNFT(address(nft)),
            new address[](0)
        );
        registry.setFeePool(IFeePool(address(feePool)));
        registry.setFeePct(5);

        vm.stopBroadcast();
    }
}

