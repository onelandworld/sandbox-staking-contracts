import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber, utils} from "ethers";
import {deployFixture, mintLands, mintLandsLarge} from "./utils";
import {chunk} from "lodash";
describe("balance", () => {
    it("should get ids and balance for staked", async () => {
        const {contract, land, sand, Alice, Bob} = await loadFixture(deployFixture);
        const ids = await mintLands(land, Bob.address, 3, 0, 0);
        await sand.connect(Alice).transfer(Bob.address, utils.parseEther("5000"));
        await land.connect(Bob).setApprovalForAll(contract.address, true);
        await sand.connect(Bob).approve(contract.address, utils.parseEther("5000"));

        await contract.connect(Bob).stake(ids, utils.parseEther("5000"));

        // check ids
        const stakedIds = (await contract.stakedTokenIds(Bob.address, 0)).map((item) => item.toNumber());
        expect(stakedIds.join(",")).to.be.equal(ids.join(","), "stakedTokenIds is right");
        // check sands
        const balance = await contract.balanceSand(Bob.address);
        expect(balance).to.be.equal(utils.parseEther("5000"), "balanceSand is right");
    });

    it("should get ids more", async () => {
        const {contract, land, sand, Alice, Bob} = await loadFixture(deployFixture);
        const ids = await mintLandsLarge(land, Bob.address);
        await land.connect(Bob).setApprovalForAll(contract.address, true);
        const chunkIds = chunk(ids, 100);
        for (const _ids of chunkIds) {
            await contract.connect(Bob).stake(_ids, 0);
        }
        // check ids
        const count = await contract.balanceLand(Bob.address);
        expect(count).to.be.equal(utils.parseUnits(ids.length + "", 0), "balanceLand is right");
        let skip = 0;
        let stakedIds: number[] = [];
        while (true) {
            const sIds = await contract.stakedTokenIds(Bob.address, skip);
            stakedIds = stakedIds.concat(sIds.map((item) => item.toNumber()));
            skip = stakedIds.length;
            if (skip >= count.toNumber() - 1) break;
        }
        expect(stakedIds.join(",")).to.be.equal(ids.join(","), "stakedTokenIds is right");
    });

    it("should get total", async () => {
        const {contract, land, sand, Alice, Bob, Caro} = await loadFixture(deployFixture);
        const ids1 = await mintLands(land, Bob.address, 6, 0, 0);
        const ids2 = await mintLands(land, Caro.address, 6, 6, 0);
        await land.connect(Bob).setApprovalForAll(contract.address, true);
        await land.connect(Caro).setApprovalForAll(contract.address, true);
        await sand.connect(Alice).transfer(Bob.address, utils.parseEther("50000"));
        await sand.connect(Alice).transfer(Caro.address, utils.parseEther("50000"));
        await sand.connect(Bob).approve(contract.address, utils.parseEther("50000"));
        await sand.connect(Caro).approve(contract.address, utils.parseEther("50000"));
        await contract.connect(Bob).stake(ids1, utils.parseEther("50000"));
        await contract.connect(Caro).stake(ids2, utils.parseEther("50000"));

        const totalLand = await contract.totalLand();
        expect(totalLand).to.be.equal(BigNumber.from(ids1.length).add(ids2.length), "totalLand is right");
        const totalSand = await contract.totalSand();
        expect(totalSand).to.be.equal(utils.parseEther("50000").mul(2), "totalSand is right");

        await contract.connect(Bob).withdraw(ids1, 0);
        expect(await contract.totalLand()).to.be.equal(
            BigNumber.from(ids2.length),
            "totalLand is right after withdraw"
        );
    });
});
