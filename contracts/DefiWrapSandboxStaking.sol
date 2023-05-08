// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./StakeLandSand.sol";
import "./interface/SandboxLandPool.sol";
import "./interface/SandboxSandPool.sol";

// import "hardhat/console.sol";

contract DefiWrapSandboxStaking is StakeLandSand, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address;

    event Staked(address indexed account, uint256[] stakeLands, uint256 stakeSands);
    event RewardPaid(address indexed account, uint256 rewardAmount);
    event LandContributionUpdated(address indexed account, uint256 newContribution, uint256 oldContribution);
    event SandContributionUpdated(address indexed account, uint256 newContribution, uint256 oldContribution);
    // share for lands_pool and sands_pool and defi
    // _share_lands_pool + _share_sands_pool + _share_defi = 100;
    uint8[3] public _share_origin = [35, 55, 10];
    // defi balance;

    // Lands contributions;
    uint256 public _landsTotalContributions;
    mapping(address => uint256) internal _landsContributions;

    // Sands contributions;
    uint256 public _sandsTotalContributions;
    mapping(address => uint256) internal _sandsContributions;

    // This value multiplied by the user contribution is the share of reward from the the last time
    mapping(address => uint256) internal landsUserRewardPerTokenPaid;
    mapping(address => uint256) internal sandsUserRewardPerTokenPaid;
    // This value is the accumulated rewards won by the user when he called the contract.
    // mapping(address => uint256) internal rewards;
    mapping(address => uint256) internal rewardsLand;
    mapping(address => uint256) internal rewardsSand;

    struct UintTwoPool {
        uint256 land;
        uint256 sand;
    }
    // rewards for all;
    uint256 private totalRewards = 0;
    // rewards from this contract;
    uint256 public defiRewards = 0;

    UintTwoPool public rewardPerTokenStored = UintTwoPool(0, 0);

    SandboxLandPool public _landPool;
    SandboxSandPool public _sandPool;

    UintTwoPool internal _lastRewardsFromSandboxPool = UintTwoPool(0, 0);
    uint256 public lastTryGetRewardTime = 0;
    UintTwoPool public lastGetRewardTime = UintTwoPool(0, 0);

    struct Delta {
        uint256 land;
        uint256 sand;
        uint256 duration;
    }
    Delta public lastDelta = Delta(0, 0, 0);

    mapping(address => uint256) public lastClaim;

    constructor(
        IERC20 sand_,
        ILand land_,
        SandboxLandPool land_pool,
        SandboxSandPool sand_pool
    ) StakeLandSand(sand_, land_) Ownable() {
        require(address(land_pool).isContract(), "land_pool is not a contract");
        require(address(sand_pool).isContract(), "sand_pool is not a contract");
        _landPool = land_pool;
        _sandPool = sand_pool;
    }

    // set share ratio
    function setShareOrigin(uint8[3] calldata share_origin) external onlyOwner {
        require(share_origin.length == 3, "Need share size is 3");
        require(share_origin[0] + share_origin[1] + share_origin[2] == 100, "Need share sum is 100!");
        _share_origin = share_origin;
    }

    function getShareOrigin() public view returns (uint8[3] memory) {
        return _share_origin;
    }

    // get share
    function getShare() public view returns (uint8[] memory) {
        return _getShare();
    }

    function getTotalRewards() public view returns (uint256) {
        return _totalRewards();
    }

    function getDelta() public view returns (Delta memory) {
        if (lastTryGetRewardTime == 0 || (block.timestamp - lastTryGetRewardTime) == 0) return lastDelta;
        return _getDelta();
    }

    function _getDelta() internal view returns (Delta memory) {
        uint256 time = block.timestamp - lastTryGetRewardTime;
        if (time == 0) return Delta(0, 0, 0);
        uint256 per = _landPool.earned(_this()) +
            _sandPool.earned(_this()) -
            _lastRewardsFromSandboxPool.land -
            _lastRewardsFromSandboxPool.sand;
        uint256 defi = _compulteDefi(per);
        uint256 land = _compulteShare(per, 0);
        uint256 sand = per - defi - land;
        return Delta(land, sand, time);
    }

    // withdraw rewards;
    function withdrawRewards() external nonReentrant whenNotPaused {
        _updateRewards(_msgSender());
        _withdrawRewards(_msgSender());
        _updateContrabution(_msgSender());
    }

    function withdrawLandRewards() external nonReentrant whenNotPaused {
        _updateRewards(_msgSender());
        _withdarwLandRewards(_msgSender());
        _updateContrabution(_msgSender());
    }

    function withdrawSandRewards() external nonReentrant whenNotPaused {
        _updateRewards(_msgSender());
        _withdarwSandRewards(_msgSender());
        _updateContrabution(_msgSender());
    }

    // withdraw rewards for owner;
    function withdrawDefiRewards(address to) external onlyOwner {
        _updateRewards(_msgSender());
        uint256 defiTx = defiRewards - _compulteLocked(defiRewards);
        if (defiTx > 0) {
            _withdrawSandsIfNeed(defiTx);
            _sand.safeTransfer(to, defiTx);
            defiRewards = defiRewards - defiTx;
            totalRewards = totalRewards - defiTx;
        }
        emit RewardPaid(to, defiTx);
    }

    function defiEarned() external view returns (uint256) {
        (, , uint256 per) = _rewardPerToken();
        return defiRewards + _compulteDefi(per);
    }

    function defiEarnedLocked() external view returns (uint256) {
        (, , uint256 per) = _rewardPerToken();
        return _compulteLocked(defiRewards + _compulteDefi(per));
    }

    /*
     *  stake Lands and Sands
     *  @params ids : lands ids
     *  @params amount :Sands ammout
     */
    function stake(uint256[] calldata ids, uint256 amount) external nonReentrant whenNotPaused {
        require(ids.length > 0 || amount > 0, "Need Lands or Sands");
        require(ids.length <= 100, "Up to 100 ids at a time");
        if (ids.length > 0) {
            bool approvedForAll = _land.isApprovedForAll(_msgSender(), _this());
            // console.log('approvedForAll:', _msgSender(), approvedForAll);
            for (uint i = 0; i < ids.length; i++) {
                require(_land.ownerOf(ids[i]) == _msgSender(), "Ownership error for lands");
                require(approvedForAll || _land.getApproved(ids[i]) == _this(), "Not approved");
            }
        }
        // fisrt set claim time;
        if (lastClaim[_msgSender()] == 0) {
            lastClaim[_msgSender()] = block.timestamp;
        }
        _updateRewards(_msgSender());
        _stake(ids, amount);
        _updateContrabution(_msgSender());
        _updatePools();
        emit Staked(_msgSender(), ids, amount);
    }

    // withdraw staked;
    function withdraw(uint256[] calldata ids, uint256 amount) external nonReentrant whenNotPaused {
        _updateRewards(_msgSender());
        if (amount > 0) _withdrawSandsIfNeed(amount);
        _withdraw(ids, amount);
        _updateContrabution(_msgSender());
        _updatePools();
    }

    // refresh Rewards for sender
    function refreshRewardsAndPools() external nonReentrant whenNotPaused {
        _updateRewards(_msgSender());
        _updatePools();
    }

    // get earned
    function earned(address account) external view returns (uint256, uint256) {
        (uint256 landPer, uint256 sandPer, ) = _rewardPerToken();
        (uint256 landEarned, uint256 sandEarned) = _earned(account, landPer, sandPer);
        return (rewardsLand[account] + landEarned, rewardsSand[account] + sandEarned);
    }

    function earnedTx(address account) external view returns (uint256, uint256) {
        (uint256 landPer, uint256 sandPer, ) = _rewardPerToken();
        (uint256 landEarned, uint256 sandEarned) = _earned(account, landPer, sandPer);
        uint256 mRewardsLand = rewardsLand[account] + landEarned;
        uint256 mRewardsSand = rewardsSand[account] + sandEarned;
        return (mRewardsLand - _compulteLocked(mRewardsLand), mRewardsSand - _compulteLocked(mRewardsSand));
    }

    function earnedLocked(address account) external view returns (uint256, uint256) {
        (uint256 landPer, uint256 sandPer, ) = _rewardPerToken();
        (uint256 landEarned, uint256 sandEarned) = _earned(account, landPer, sandPer);
        uint256 mRewardsLand = rewardsLand[account] + landEarned;
        uint256 mRewardsSand = rewardsSand[account] + sandEarned;
        return (_compulteLocked(mRewardsLand), _compulteLocked(mRewardsSand));
    }

    function _withdrawRewards(address account) internal {
        _withdarwLandRewards(account);
        _withdarwSandRewards(account);
    }

    function _withdarwLandRewards(address account) internal {
        uint256 reward = rewardsLand[account] - _compulteLocked(rewardsLand[account]);
        if (reward > 0) {
            _withdrawSandsIfNeed(reward);
            rewardsLand[account] = rewardsLand[account] - reward;
            totalRewards = totalRewards - reward;
            _sand.safeTransfer(account, reward);
        }
        emit RewardPaid(account, reward);
    }

    function _withdarwSandRewards(address account) internal {
        uint256 reward = rewardsSand[account] - _compulteLocked(rewardsSand[account]);
        if (reward > 0) {
            _withdrawSandsIfNeed(reward);
            rewardsSand[account] = rewardsSand[account] - reward;
            totalRewards = totalRewards - reward;
            _sand.safeTransfer(account, reward);
        }
        emit RewardPaid(account, reward);
    }

    function _totalRewards() internal view returns (uint256) {
        (, , uint256 per) = _rewardPerToken();
        return totalRewards + per;
    }

    function _balance() internal view returns (uint256) {
        return _sand.balanceOf(_this());
    }

    function _compulteLocked(uint256 value) internal view returns (uint256) {
        uint256 total = _totalRewards();
        if (total == 0) return 0;
        uint256 locked = (value * _totalLocked()) / total;
        return locked > value ? value : locked;
    }

    function _totalLocked() internal view returns (uint256) {
        uint256 locked = 0;
        if ((_landPool.timeLockClaim() + lastGetRewardTime.land) > block.timestamp) {
            locked = locked + _landPool.earned(_this());
        }
        if ((_sandPool.antiCompound() + lastGetRewardTime.sand) > block.timestamp) {
            locked = locked + _sandPool.earned(_this());
        }
        return locked;
    }

    function _compulteDefi(uint256 per) internal view returns (uint256) {
        return _compulteShare(per, 2);
    }

    function _updateRewards(address account) internal {
        // updateLastDelta
        if ((block.timestamp - lastTryGetRewardTime) > 0) lastDelta = _getDelta();
        // updatePerStored
        (uint256 landPer, uint256 sandPer, uint256 per) = _rewardPerToken();
        _doTryGetRewards();
        totalRewards = totalRewards + per;
        uint256 defi = _compulteDefi(per);
        defiRewards = defiRewards + defi;
        rewardPerTokenStored.land = rewardPerTokenStored.land + landPer;
        rewardPerTokenStored.sand = rewardPerTokenStored.sand + sandPer;
        (uint256 earnedLand, uint256 earnedSand) = _earned(account, 0, 0);
        rewardsLand[account] = rewardsLand[account] + earnedLand;
        rewardsSand[account] = rewardsSand[account] + earnedSand;
        landsUserRewardPerTokenPaid[account] = rewardPerTokenStored.land;
        sandsUserRewardPerTokenPaid[account] = rewardPerTokenStored.sand;
    }

    function _doTryGetRewards() internal {
        if((_landPool.timeLockClaim() + lastGetRewardTime.land) <= block.timestamp){
            try _landPool.getReward() {
                _lastRewardsFromSandboxPool.land = 0;
                lastGetRewardTime.land = block.timestamp;
            } catch {
                _lastRewardsFromSandboxPool.land = _landPool.earned(_this());
            }
        } else {
             _lastRewardsFromSandboxPool.land = _landPool.earned(_this());
        }
        if((_sandPool.antiCompound() + lastGetRewardTime.sand) <= block.timestamp){
            try _sandPool.getReward() {
                _lastRewardsFromSandboxPool.sand = 0;
                lastGetRewardTime.sand = block.timestamp;
            } catch {
                _lastRewardsFromSandboxPool.sand = _sandPool.earned(_this());
            }
        } else {
            _lastRewardsFromSandboxPool.sand = _sandPool.earned(_this());
        }
        lastTryGetRewardTime = block.timestamp;
    }

    function _earned(
        address account,
        uint256 rewardPerTokenLands,
        uint256 rewardPerTokenSands
    ) internal view returns (uint256, uint256) {
        uint256 lands = ((rewardPerTokenLands + rewardPerTokenStored.land - landsUserRewardPerTokenPaid[account]) *
            _landsContributions[account]) / 1e24;
        uint256 sands = ((rewardPerTokenSands + rewardPerTokenStored.sand - sandsUserRewardPerTokenPaid[account]) *
            _sandsContributions[account]) / 1e24;
        return (lands, sands);
    }

    function _rewardPerToken() internal view returns (uint256, uint256, uint256) {
        uint256 rewardLandPool = _landPool.earned(_this()) - _lastRewardsFromSandboxPool.land;
        uint256 rewardSandPool = _sandPool.earned(_this()) - _lastRewardsFromSandboxPool.sand;
        uint256 perRewards = rewardLandPool + rewardSandPool;
        uint256 defi = _compulteDefi(perRewards);
        uint256 land = _compulteShare(perRewards, 0);
        uint256 sand = perRewards - defi - land;
        uint256 landPer = _landsTotalContributions == 0 ? 0 : (land * 1e24) / _landsTotalContributions;
        uint256 sandPer = _sandsTotalContributions == 0 ? 0 : (sand * 1e24) / _sandsTotalContributions;
        return (landPer, sandPer, perRewards);
    }

    function _updateContrabution(address account) internal {
        // lands
        uint256 oldLandContri = _landsContributions[account];
        _landsTotalContributions = _landsTotalContributions - oldLandContri;
        _landsContributions[account] = balanceLand(account);
        _landsTotalContributions = _landsTotalContributions + _landsContributions[account];
        // sands
        uint256 oldSandContri = _sandsContributions[account];
        _sandsTotalContributions = _sandsTotalContributions - oldSandContri;
        _sandsContributions[account] = balanceSand(account);
        _sandsTotalContributions = _sandsTotalContributions + _banlance_sand[account];
        if (_landsContributions[account] != oldLandContri)
            emit LandContributionUpdated(account, _landsContributions[account], oldLandContri);
        if (_sandsContributions[account] != oldSandContri)
            emit SandContributionUpdated(account, _sandsContributions[account], oldSandContri);
    }

    function _compulteShare(uint256 value, uint i) internal view returns (uint256) {
        return (value * _getShare()[i]) / 100;
    }

    function _getShare() internal view returns (uint8[] memory) {
        uint8[] memory _share = new uint8[](3);
        if (_landsTotalContributions == 0) {
            _share[0] = 0;
            _share[1] = 100 - _share_origin[2];
        } else {
            _share[0] = _share_origin[0];
            _share[1] = _share_origin[1];
        }
        _share[2] = _share_origin[2];
        return _share;
    }

    function _availableSands() internal view returns (uint256) {
        return _sand.balanceOf(_this());
    }

    function _withdrawSandsIfNeed(uint256 withdrawAmount) internal {
        uint256 balance = _sand.balanceOf(_this());
        if (balance < withdrawAmount) {
            uint256 sandPoolBalance = _sandPool.balanceOf(_this());
            if ((sandPoolBalance + balance) >= withdrawAmount) {
                _sandPool.withdraw(withdrawAmount - balance);
            } else {
                if (sandPoolBalance > 0) _sandPool.withdraw(sandPoolBalance);
                _landPool.withdraw(withdrawAmount - sandPoolBalance - balance);
            }
        }
    }

    // Adjust the pledge amount of the two pools to ensure the highest return
    function _updatePools() internal {
        uint256 maxLandPool = _landPool.maxStakeAllowedCalculator(_this());
        uint256 landPoolBalance = _landPool.balanceOf(_this());
        uint256 sandPoolBalance = _sandPool.balanceOf(_this());
        uint256 sands = _availableSands();
        bool sands_changed = false;
        if (maxLandPool > landPoolBalance) {
            // need to stake in _landPool;
            if (sands >= (maxLandPool - landPoolBalance)) {
                _sand.approve(address(_landPool), maxLandPool - landPoolBalance);
                _landPool.stake(maxLandPool - landPoolBalance);
                sands_changed = true;
            } else if ((sands + sandPoolBalance) >= (maxLandPool - landPoolBalance)) {
                _sandPool.withdraw(maxLandPool - landPoolBalance - sands);
                _sand.approve(address(_landPool), maxLandPool - landPoolBalance);
                _landPool.stake(maxLandPool - landPoolBalance);
                sands_changed = true;
            } else if (sands + sandPoolBalance > 0) {
                if (sandPoolBalance > 0) _sandPool.withdraw(sandPoolBalance);
                _sand.approve(address(_landPool), sands + sandPoolBalance);
                _landPool.stake(sands + sandPoolBalance);
                sands_changed = true;
            }
        } else if (maxLandPool < landPoolBalance) {
            // need do withdraw from _landPool;
            _landPool.withdraw(landPoolBalance - maxLandPool);
            sands_changed = true;
        }
        // others sands stake in _sandPool
        if (sands_changed) sands = _availableSands();
        if (sands > 0) {
            _sand.approve(address(_sandPool), sands);
            _sandPool.stake(sands);
        }
    }
}
