import {loadFixture,time} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {utils} from "ethers";
import {deployFixture, mintLands} from "./utils";
describe("share", () => {
    it("should set share origin", async () => {
        const {contract, land, sand, Alice, Bob} = await loadFixture(deployFixture);
        const ids1 = await mintLands(land, Bob.address, 6, 0, 0);
        await land.connect(Bob).setApprovalForAll(contract.address, true);
        await sand.connect(Alice).transfer(Bob.address, utils.parseEther("50000"));
        await sand.connect(Bob).approve(contract.address, utils.parseEther("50000"));
        await contract.connect(Bob).stake(ids1, utils.parseEther("50000"));
        
        await contract.connect(Alice).setShareOrigin([30, 50, 20]);
        expect(await contract.getShare()).to.be.deep.equal([30, 50, 20], "set share is right");
    });

    it("should get Delta", async () => {
        const {contract, land, sand, Alice, Bob} = await loadFixture(deployFixture);
        const delta1 = await contract.getDelta();
        const zero = utils.parseUnits("0", 0);
        expect(delta1).to.be.deep.equal([zero, zero, zero], "first delta is zero");

        const ids1 = await mintLands(land, Bob.address, 6, 0, 0);
        await land.connect(Bob).setApprovalForAll(contract.address, true);
        await sand.connect(Alice).transfer(Bob.address, utils.parseEther("50000"));
        await sand.connect(Bob).approve(contract.address, utils.parseEther("50000"));
        await contract.connect(Bob).stake(ids1, utils.parseEther("50000"));
        await time.increase(time.duration.seconds(10))
        const delta2 = await contract.getDelta();
        console.info('delta', delta2)
    });
});
