// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

interface SandboxLandPool {

    // balance for stake 
    function balanceOf(address account) external view returns(uint256);

    // stake sands
    function stake(uint256 amount) external payable;

    // withdraw stake;
    function withdraw(uint256 amount) external;

    // exit -> withdraw stake, withdraw rewards
    function exit() external;

    // available earnings for some user
    function earned(address account) external view returns (uint256);

    // withdraw rewards
    function getReward() external;

    // time lock
    function timeLockClaim() external view returns (uint256);
    // function getRemainingTimelockClaim() external view returns (uint256);
    // function getRemainingTimelockWithdraw() external view returns (uint256);
    // function getRemainingTimelockDeposit() external view returns (uint256);
    // max stake
    function maxStakeAllowedCalculator(address account) external view returns (uint256);
}
