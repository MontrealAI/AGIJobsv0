// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IAGIJobManagerRead {
    function quoteCreateJobBurn(uint256 payout) external view returns (uint256);
    function getCreateJobFundingRequirement(uint256 payout) external view returns (uint256);
    function getCreateJobAllowanceRequirement(uint256 payout) external view returns (uint256);
    function getJobBurnAmountSnapshot(uint256 jobId) external view returns (uint256);
}

contract EmployerBurnReadHelper {
    function quoteCreateJobBurn(address manager, uint256 payout) external view returns (uint256) {
        return IAGIJobManagerRead(manager).quoteCreateJobBurn(payout);
    }

    function getCreateJobFundingRequirement(address manager, uint256 payout) external view returns (uint256) {
        return IAGIJobManagerRead(manager).getCreateJobFundingRequirement(payout);
    }

    function getCreateJobAllowanceRequirement(address manager, uint256 payout) external view returns (uint256) {
        return IAGIJobManagerRead(manager).getCreateJobAllowanceRequirement(payout);
    }

    function getJobBurnAmountSnapshot(address manager, uint256 jobId) external view returns (uint256) {
        return IAGIJobManagerRead(manager).getJobBurnAmountSnapshot(jobId);
    }
}
