// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface ILand is IERC721 {
    // batch sands
    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        bytes calldata data
    ) external;

    function batchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        bytes calldata data
    ) external;

    
}
