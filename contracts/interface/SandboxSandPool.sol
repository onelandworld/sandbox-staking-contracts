// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

interface SandboxSandPool {
    // get staked sand for pool
    function balanceOf(address account) external view returns (uint256);
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

    // cliam lock time
    function antiCompound() external view returns (uint256);
}
