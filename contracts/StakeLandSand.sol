// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";
import "./interface/ILand.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract StakeLandSand is Context, IERC721Receiver {
    using SafeERC20 for IERC20;
    using Address for address;
    using EnumerableSet for EnumerableSet.UintSet;

    event WithdrawnLand(address indexed account, uint256[] ids);
    event WithdrawnSand(address indexed account, uint256 amount);

    ILand internal _land;
    IERC20 internal _sand;
    // balance for Sands;
    mapping(address => uint256) internal _banlance_sand;
    uint256 internal _totalSand;

    // balance for lands;
    mapping(address => EnumerableSet.UintSet) internal _banlance_land;
    uint256 internal _totalLand;

    bytes4 internal constant _ERC721_RECEIVED = 0x150b7a02;
    bytes4 internal constant _ERC721_BATCH_RECEIVED = 0x4b808c46;
    bytes internal constant _DATA = "0x";

    constructor(IERC20 sand_, ILand land_) {
        require(address(sand_).isContract(), "Sand is not a contract");
        require(address(land_).isContract(), "Land is not a contract");
        _sand = sand_;
        _land = land_;
    }

    function totalLand() public view returns (uint256) {
        return _totalLand;
    }

    function totalSand() public view returns (uint256) {
        return _totalSand;
    }

    function stakedTokenId(address account, uint256 index) public view returns (uint256) {
        require(index < _banlance_land[account].length(), "index error");
        return _banlance_land[account].at(index);
    }

    function stakedTokenIds(address account, uint skip) public view returns (uint256[] memory) {
        EnumerableSet.UintSet storage set = _banlance_land[account];
        if(set.length() == 0) return new uint256[](0);
        require(skip < set.length(), "skip must less balanceLand");
        uint256 end = Math.min(set.length(), skip + 100);
        uint256[] memory ids = new uint256[](end - skip);
        for (uint i = skip; i < end; i++) {
            ids[i - skip] = set.at(i);
        }
        return ids;
    }

    function balanceLand(address account) public view returns (uint256) {
        return _banlance_land[account].length();
    }

    function balanceSand(address account) public view returns (uint256) {
        return _banlance_sand[account];
    }

    function _stakeLand(uint256[] calldata ids) internal virtual {
        _totalLand = _totalLand + ids.length;
        for (uint i = 0; i < ids.length; i++) {
            _banlance_land[_msgSender()].add(ids[i]);
        }
        _land.safeBatchTransferFrom(_msgSender(), _this(), ids, _DATA);
    }

    function _withdrawLand(uint256[] calldata ids) internal virtual {
        _totalLand = _totalLand - ids.length;
        for (uint i = 0; i < ids.length; i++) {
            require(_banlance_land[_msgSender()].contains(ids[i]), "StakeLandSand: Ids error");
            _banlance_land[_msgSender()].remove(ids[i]);
        }
        _land.safeBatchTransferFrom(_this(), _msgSender(), ids, _DATA);
        emit WithdrawnLand(_msgSender(), ids);
    }

    function _stakeSand(uint256 amount) internal virtual {
        require(amount > 0, "StakeLandSand: amount > 0");
        require(_sand.allowance(_msgSender(), _this()) >= amount, "StakeLandSand: allowance error");
        _totalSand = _totalSand + amount;
        _banlance_sand[_msgSender()] = _banlance_sand[_msgSender()] + amount;
        _sand.safeTransferFrom(_msgSender(), _this(), amount);
    }

    function _withdrawSand(uint256 amount) internal virtual {
        require(amount > 0, "StakeLandSand: amount > 0");
        require(_banlance_sand[_msgSender()] >= amount, "StakeLandSand: amount <= balance");
        _totalSand = _totalSand - amount;
        _banlance_sand[_msgSender()] = _banlance_sand[_msgSender()] - amount;
        _sand.safeTransfer(_msgSender(), amount);
        emit WithdrawnSand(_msgSender(), amount);
    }

    function _this() internal view virtual returns (address) {
        return address(this);
    }

    function _stake(uint256[] calldata ids, uint256 amount) internal virtual {
        if (ids.length > 0) _stakeLand(ids);
        if (amount > 0) _stakeSand(amount);
    }

    function _withdraw(uint256[] calldata ids, uint256 amount) internal virtual {
        if (ids.length > 0) _withdrawLand(ids);
        if (amount > 0) _withdrawSand(amount);
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata /*data*/
    ) external view override returns (bytes4) {
        require(operator == _this(), "Operator is not this contract");
        require(_banlance_land[from].contains(tokenId), "tokenId error");
        return _ERC721_RECEIVED;
    }

    function onERC721BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        bytes calldata /*data*/
    ) external view returns (bytes4) {
        require(operator == _this(), "Operator is not this contract");
        for (uint i = 0; i < ids.length; i++) {
            require(_banlance_land[from].contains(ids[i]), "ids error");
        }
        return _ERC721_BATCH_RECEIVED;
    }
}
