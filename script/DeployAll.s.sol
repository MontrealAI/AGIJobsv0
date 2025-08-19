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
import {CertificateNFT} from "contracts/v2/CertificateNFT.sol";
import {ICertificateNFT} from "contracts/v2/interfaces/ICertificateNFT.sol";
import {FeePool} from "contracts/v2/FeePool.sol";
import {PlatformRegistry} from "contracts/v2/PlatformRegistry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
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
        address owner;
        try owner = vm.envAddress("OWNER") {
        } catch {
            owner = vm.addr(deployer);
        }
        vm.startBroadcast(deployer);

        AGIALPHAToken token = new AGIALPHAToken();
        token.mint(owner, 1_000_000e6);

        StakeManager stake = new StakeManager(
            IERC20(address(token)),
            0,
            0,
            0,
            owner,
            address(0),
            address(0)
        );

        JobRegistry registry = new JobRegistry(owner);

        TaxPolicy tax = new TaxPolicy(
            owner,
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
        CertificateNFT nft = new CertificateNFT("Cert", "CERT");
        DisputeModule dispute = new DisputeModule(registry, 0, 0, address(0));

        FeePool feePool = new FeePool(
            IERC20(address(token)),
            IStakeManager(address(stake)),
            0,
            owner
        );

        RevenueDistributor distributor = new RevenueDistributor(
            stake,
            owner
        );

        PlatformRegistry platformRegistry = new PlatformRegistry(
            IStakeManager(address(stake)),
            IReputationEngine(address(reputation)),
            1_000e6,
            owner
        );

        nft.setJobRegistry(address(registry));
        nft.setStakeManager(address(stake));
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

        address[] memory contracts = new address[](11);
        contracts[0] = address(token);
        contracts[1] = address(stake);
        contracts[2] = address(registry);
        contracts[3] = address(validation);
        contracts[4] = address(reputation);
        contracts[5] = address(dispute);
        contracts[6] = address(nft);
        contracts[7] = address(feePool);
        contracts[8] = address(distributor);
        contracts[9] = address(platformRegistry);
        contracts[10] = address(tax);
        for (uint256 i = 0; i < contracts.length; i++) {
            Ownable(contracts[i]).transferOwnership(owner);
        }

        string memory json = vm.serializeAddress(
            "contracts",
            "agiAlphaToken",
            address(token)
        );
        json = vm.serializeAddress("contracts", "stakeManager", address(stake));
        json = vm.serializeAddress("contracts", "jobRegistry", address(registry));
        json = vm.serializeAddress("contracts", "validationModule", address(validation));
        json = vm.serializeAddress(
            "contracts",
            "reputationEngine",
            address(reputation)
        );
        json = vm.serializeAddress("contracts", "disputeModule", address(dispute));
        json = vm.serializeAddress("contracts", "certificateNFT", address(nft));
        json = vm.serializeAddress("contracts", "platformRegistry", address(platformRegistry));
        json = vm.serializeAddress("contracts", "feePool", address(feePool));
        json = vm.serializeAddress(
            "contracts",
            "revenueDistributor",
            address(distributor)
        );
        json = vm.serializeAddress("contracts", "taxPolicy", address(tax));
        string memory path = string.concat(
            vm.projectRoot(),
            "/docs/deployment-addresses.json"
        );
        vm.writeJson(json, path);

        vm.stopBroadcast();
    }
}

