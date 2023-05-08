import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {utils} from "ethers";
import {assertAbsSands, deployFixture, earnedPools, mintLand, mintLands} from "./utils";

describe("stake", () => {
    it("Should can do stake withdraw and withdrawRewards", async () => {
        const {contract, land, sand, Alice, Bob, Caro} = await loadFixture(deployFixture);
        const [id] = await mintLands(land, Bob.address, 3, 0, 0);
        const otherId = await mintLand(land, Caro.address, 4, 0);
        await sand.connect(Alice).transfer(Bob.address, utils.parseEther("5000"));
        await sand.connect(Alice).transfer(Caro.address, utils.parseEther("5000"));
        // errors
        await expect(contract.connect(Bob).stake([], 0)).to.be.rejectedWith(
            /Need Lands or Sands/,
            "Should be error when empty"
        );
        await expect(contract.connect(Bob).stake([id], 0)).to.be.rejectedWith(
            /Not approved/,
            "Should be error when not approved"
        );
        await land.connect(Caro).approve(contract.address, otherId);
        await expect(contract.connect(Bob).stake([otherId], 0)).to.be.rejectedWith(
            /Ownership error for lands/,
            "Should be error when other id"
        );
        await expect(contract.connect(Bob).stake([], utils.parseEther("1000"))).to.be.rejectedWith(
            /StakeLandSand: allowance error/,
            "Should be error when allowance not enough"
        );

        // stake land
        await land.connect(Bob).approve(contract.address, id);
        await expect(contract.connect(Bob).stake([id], 0), "Bob 1st staked")
            .to.emit(contract, "Staked")
            .withArgs(Bob.address, [id], 0);

        // stake sand
        await sand.connect(Bob).approve(contract.address, utils.parseEther("3000"));
        await expect(contract.connect(Bob).stake([], utils.parseEther("3000")), "Bob 2st staked")
            .to.emit(contract, "Staked")
            .withArgs(Bob.address, [], utils.parseEther("3000"));

        // stake land + sand;
        await land.connect(Caro).approve(contract.address, otherId);
        await sand.connect(Caro).approve(contract.address, utils.parseEther("3000"));
        await expect(contract.connect(Caro).stake([otherId], utils.parseEther("3000")), "Caro 1st staked")
            .to.emit(contract, "Staked")
            .withArgs(Caro.address, [otherId], utils.parseEther("3000"));

        // time increase 7 days
        await time.increase(time.duration.days(6));
        // withdraw;
        await expect(contract.connect(Bob).withdraw([id], utils.parseEther("3000")), "Bob 1st withdraw")
            .to.changeTokenBalance(sand, Bob.address, utils.parseEther("3000"))
            .changeTokenBalance(land, Bob.address, 1);
        const [bobEarnedTxLand, bobEarnedTxSand] = await contract.earnedTx(Bob.address);
        // console.info('bobtx:', bobEarnedTxLand.toString(), bobEarnedTxSand.toString())
        await expect(contract.connect(Bob).withdrawRewards(), "Bob 1st withdrawRewards")
            .to.emit(contract, "RewardPaid")
            .withArgs(Bob.address, bobEarnedTxLand)
            .to.emit(contract, "RewardPaid")
            .withArgs(Bob.address, bobEarnedTxSand)
            .changeTokenBalance(sand, Bob.address, bobEarnedTxLand.add(bobEarnedTxSand));
        // await logEarned(Bob, contract);
        const [caroEarnedTxLand, caroEarnedTxSand] = await contract.earnedTx(Caro.address);

        // console.info('caroTx:', caroEarnedTxLand.toString(), caroEarnedTxSand.toString())
        await expect(contract.connect(Caro).withdrawRewards(), "Caro 1st withdrawRewards")
            .to.emit(contract, "RewardPaid")
            .withArgs(Caro.address, caroEarnedTxLand)
            .to.emit(contract, "RewardPaid")
            .withArgs(Caro.address, caroEarnedTxSand)
            .changeTokenBalance(sand, Caro.address, caroEarnedTxLand.add(caroEarnedTxSand));
        await expect(contract.connect(Caro).withdraw([otherId], utils.parseEther("3000")), "Caro 1st withdraw")
            .to.changeTokenBalance(sand, Caro.address, utils.parseEther("3000"))
            .changeTokenBalance(land, Caro.address, 1);
        // time increase 1 day
        await time.increase(time.duration.days(1));

        const [bobEarnedLand, bobEarnedSand] = await contract.earnedTx(Bob.address);
        // console.info('bobTx2:', bobEarnedLand.toString(), bobEarnedSand.toString())
        await expect(contract.connect(Bob).withdrawRewards(), "Bob 2st withdrawRewards")
            .to.emit(contract, "RewardPaid")
            .withArgs(Bob.address, bobEarnedLand)
            .to.emit(contract, "RewardPaid")
            .withArgs(Bob.address, bobEarnedSand)
            .changeTokenBalance(sand, Bob.address, bobEarnedLand.add(bobEarnedSand));

        const [caroEarnedLand, caroEarnedSand] = await contract.earnedTx(Caro.address);
        // console.info('caroTx2:', caroEarnedLand.toString(), caroEarnedSand.toString())
        await expect(contract.connect(Caro).withdrawRewards(), "Caro 2st withdrawRewards")
            .to.emit(contract, "RewardPaid")
            .withArgs(Caro.address, caroEarnedLand)
            .to.emit(contract, "RewardPaid")
            .withArgs(Caro.address, caroEarnedSand)
            .changeTokenBalance(sand, Caro.address, caroEarnedLand.add(caroEarnedSand));

        // defiWithdraw
        const defi = await contract.defiEarned();
        const defiLocked = await contract.defiEarnedLocked();
        const defiTx = defi.sub(defiLocked);
        console.info('defiTx:', defiTx.toString())
        await expect(contract.connect(Alice).withdrawDefiRewards(Alice.address), "Withdraw defirewards")
            .to.emit(contract, "RewardPaid")
            .withArgs(Alice.address, defiTx)
            .changeTokenBalance(sand, Alice.address, defiTx);

            
    });

    it("Should be do stake and calculator right", async () => {
        const {contract, land, sand, landPool, sandPool, Alice, Bob, Caro, provider} = await loadFixture(deployFixture);
        const ids1 = await mintLands(land, Bob.address, 3, 3, 3);
        const ids2 = await mintLands(land, Caro.address, 3, 6, 6);
        await sand.connect(Alice).transfer(Bob.address, utils.parseEther("500000"));
        await sand.connect(Alice).transfer(Caro.address, utils.parseEther("500000"));
        await land.connect(Bob).setApprovalForAll(contract.address, true);
        await land.connect(Caro).setApprovalForAll(contract.address, true);
        await sand.connect(Bob).approve(contract.address, utils.parseEther("500000"));
        await sand.connect(Caro).approve(contract.address, utils.parseEther("500000"));

        // Bob stake
        const bobStake1 = await (await contract.connect(Bob).stake(ids1.slice(2), utils.parseEther("180000"))).wait();
        const bobBlock1 = await provider.getBlock(bobStake1.blockNumber);
        // 3 days and then Caro stake
        await time.setNextBlockTimestamp(bobBlock1.timestamp + time.duration.days(3));
        await time.increaseTo(bobBlock1.timestamp + time.duration.days(3) - 1);
        const share = await contract.getShare();
        const userShare = Math.round(share[0] + share[1]);
        const earnedAll1 = await earnedPools(landPool, sandPool, contract);
        const earned1 = earnedAll1.mul(userShare).div("100");
        const [earnedLand1, earnedSand1] = await contract.earned(Bob.address);
        assertAbsSands(earnedLand1, earned1.mul(share[0]).div(userShare), "Bob 1st EarnedLand is right");
        assertAbsSands(earnedSand1, earned1.mul(share[1]).div(userShare), "Bob 1st EarnedSand is right");
        const caroStake1 = await (await contract.connect(Caro).stake(ids2.slice(2), utils.parseEther("180000"))).wait();
        const caroBlock1 = await provider.getBlock(caroStake1.blockNumber);
        // 3 days and then Bob,Caro stake
        await time.increaseTo(caroBlock1.timestamp + time.duration.days(3));
        const earnedAll2 = await earnedPools(landPool, sandPool, contract);
        const earned2 = earnedAll2.sub(earnedAll1).mul(userShare).div("100").div(2);
        const [earnedLand2, earnedSand2] = await contract.earned(Bob.address);
        const [earnedLand3, earnedSand3] = await contract.earned(Caro.address);
        assertAbsSands(
            earnedLand2,
            earned2.mul(share[0]).div(userShare).add(earnedLand1),
            "Bob 2st EarnedLand is right"
        );
        assertAbsSands(
            earnedSand2,
            earned2.mul(share[1]).div(userShare).add(earnedSand1),
            "Bob 2st EarnedSand is right"
        );
        assertAbsSands(earnedLand3, earned2.mul(share[0]).div(userShare), "Caro 1st EarnedLand is right");
        assertAbsSands(earnedSand3, earned2.mul(share[1]).div(userShare), "Caro 1st EarnedSand is right");
        const bobStake2 = await (await contract.connect(Bob).stake(ids1.slice(0, 2), utils.parseEther("8000"))).wait();
        const bobBlock2 = await provider.getBlock(bobStake2.blockNumber);
        const caroStake2 = await (
            await contract.connect(Caro).stake(ids2.slice(0, 2), utils.parseEther("8000"))
        ).wait();
        const caroBlock2 = await provider.getBlock(caroStake2.blockNumber);
        // 3 days
        await time.increaseTo(caroBlock2.timestamp + time.duration.days(3));
        const earnedAll3 = await earnedPools(landPool, sandPool, contract);
        const earned3 = earnedAll3.sub(earnedAll2).sub(earnedAll1).mul(userShare).div("100").div(2);
        const [bobEarnedLand, bobEarnedSand] = await contract.earned(Bob.address);
        const [caroEarnedLand, caroEarnedSand] = await contract.earned(Caro.address);
        assertAbsSands(
            bobEarnedLand,
            earned3.mul(share[0]).div(userShare).add(earnedLand1).add(earnedLand2),
            "Bob 3st EarnedLand is right"
        );
        assertAbsSands(
            bobEarnedSand,
            earned3.mul(share[1]).div(userShare).add(earnedSand1).add(earnedSand2),
            "Bob 2st EarnedSand is right"
        );
        assertAbsSands(
            caroEarnedLand,
            earned3.mul(share[0]).div(userShare).add(earnedLand3),
            "Caro 2st EarnedLand is right"
        );
        assertAbsSands(
            caroEarnedSand,
            earned3.mul(share[1]).div(userShare).add(earnedSand3),
            "Caro 2st EarnedSand is right"
        );
    });
});
