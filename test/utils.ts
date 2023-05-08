import {expect} from "chai";
import {LandPool} from "./../typechain-types/contracts/sandbox/LandPool";
import {SandPool} from "./../typechain-types/contracts/sandbox/SandPool";
import {DefiWrapSandboxStaking} from "./../typechain-types/contracts/DefiWrapSandboxStaking";
import {time} from "@nomicfoundation/hardhat-network-helpers";
import {BigNumber, utils} from "ethers";
import {ethers, upgrades} from "hardhat";
import {Land, Land__factory} from "./../typechain-types";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

const {provider} = ethers;

export async function deployTrusted() {
    const factory = await ethers.getContractFactory("Forwarder");
    return factory.connect(provider.getSigner()).deploy();
}

export async function deployLand(trusted: string) {
    const [Alice] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("Land");
    const contract = await upgrades.deployProxy(factory, [trusted]);
    const land = Land__factory.connect(contract.address, provider);
    await land.connect(Alice).setMinter(Alice.address, true);
    return land;
}

export async function deploySand(trusted: string) {
    const factory = await ethers.getContractFactory("Sand");
    const [Alice] = await ethers.getSigners();
    const sand = await factory
        .connect(provider.getSigner())
        .deploy(Alice.address, trusted, Alice.address, Alice.address);
    const total = utils.parseEther("1000000000");
    const encodedAmount = utils.defaultAbiCoder.encode(["uint256"], [total.toString()]);
    const tx = await sand.connect(Alice).deposit(Alice.address, encodedAmount);
    await tx.wait();
    return sand;
}

export async function deployLandPool(stake: string, reward: string, trusted: string) {
    const factory = await ethers.getContractFactory("LandPool");
    return factory.connect(provider.getSigner()).deploy(stake, reward, trusted);
}

export async function deploySandPool(stake: string, reward: string, trusted: string) {
    const factory = await ethers.getContractFactory("SandPool");
    return factory.connect(provider.getSigner()).deploy(stake, reward, trusted);
}

export async function deployRewardCalculator(pool: string) {
    const factory = await ethers.getContractFactory("TwoPeriodsRewardCalculator");
    const contract = await factory.connect(provider.getSigner()).deploy(pool);
    const [Alice] = await ethers.getSigners();
    await contract.connect(Alice).grantRole(await contract.REWARD_DISTRIBUTION(), Alice.address);
    return contract;
}

export async function deployLandContributionCalculator(land: string) {
    const factory = await ethers.getContractFactory("LandContributionCalculator");
    return factory.connect(provider.getSigner()).deploy(land);
}

export const AddName: {[k: string]: string} = {};

export async function deployFixture() {
    const [Alice, Bob, Caro, Dave] = await ethers.getSigners();
    AddName[Alice.address] = "Alice";
    
    AddName[Bob.address] = "Bob";
    AddName[Caro.address] = "Caro";
    AddName[Dave.address] = "Dave";
    const trusted = await deployTrusted();
    const sand = await deploySand(trusted.address);
    const land = await deployLand(trusted.address);
    const sandPool = await deploySandPool(sand.address, sand.address, trusted.address);
    const landPool = await deployLandPool(sand.address, sand.address, trusted.address);
    const weeks4 = time.duration.weeks(4);
    // landPool init
    await landPool
        .connect(Alice)
        .setERC721RequirementList(land.address, [], true, 1, utils.parseUnits("2000", 18), 0, 0);
    const landPoolCalculator = await deployRewardCalculator(landPool.address);
    await landPoolCalculator.connect(Alice).setInitialCampaign(utils.parseUnits("800000", 18), weeks4);
    await landPoolCalculator.connect(Alice).updateNextCampaign(utils.parseUnits("800000", 18), weeks4);
    await landPool.connect(Alice).setRewardCalculator(landPoolCalculator.address, true);
    await landPool.connect(Alice).setTimelockClaim(time.duration.weeks(1));
    await sand.connect(Alice).transfer(landPool.address, utils.parseUnits("1600000", 18));
    // sandPool init
    const sandPoolCalculator = await deployRewardCalculator(sandPool.address);
    await sandPoolCalculator.connect(Alice).setInitialCampaign(utils.parseUnits("800000", 18), weeks4);
    await sandPoolCalculator.connect(Alice).updateNextCampaign(utils.parseUnits("800000", 18), weeks4);
    await sandPool.connect(Alice).setRewardCalculator(sandPoolCalculator.address, true);
    await sandPool.connect(Alice).setAntiCompoundLockPeriod(time.duration.weeks(1));
    const sandContirbutionCalclator = await deployLandContributionCalculator(land.address);
    await sandPool.connect(Alice).setContributionCalculator(sandContirbutionCalclator.address);
    await sand.connect(Alice).transfer(sandPool.address, utils.parseUnits("1600000", 18));
    landPool.timeLockClaim();
    // console.info("balance:", (await sand.balanceOf(landPool.address)).toString())

    const factory = await ethers.getContractFactory("DefiWrapSandboxStaking");
    const contract = await factory
        .connect(provider.getSigner())
        .deploy(sand.address, land.address, landPool.address, sandPool.address);

    return {
        sand,
        land,
        landPool,
        sandPool,
        landPoolCalculator,
        sandPoolCalculator,
        contract,
        Alice,
        Bob,
        Caro,
        Dave,
        provider,
    };
}

export async function mintLand(land: Land, to: string, x: number, y: number) {
    const [Alice] = await ethers.getSigners();
    await land.connect(Alice).mintQuad(to, 1, x, y, "0x00");
    return Math.round(x + y * 408);
}

export async function mintLands(land: Land, to: string, size: 3 | 6 | 12 | 24, x: number, y: number) {
    if (x > 408 || y > 408) throw "Error x or y";
    const [Alice] = await ethers.getSigners();
    // const gas = await land.connect(Alice).estimateGas.mintQuad(to, size, x, y, "0x00");
    const gas = utils.parseUnits("60000", 0).add(utils.parseUnits("10000", 0).mul(size).mul(size));
    // console.info("gas:", `s:${size}-x:${x}-y:${y} -->`, gas.toString());
    await land.connect(Alice).mintQuad(to, size, x, y, "0x00", {gasLimit: gas});
    const ids: number[] = [];
    for (let i = 0; i < Math.round(size * size); i++) {
        const ix = Math.round(x + (i % size));
        const iy = Math.floor(y + i / size);
        ids.push(Math.round(ix + iy * 408));
    }
    return ids;
}

export async function mintLandsLarge(land: Land, to: string, count: number = 1) {
    let ids: number[] = [];
    for (let i = 0; i < count; i++) {
        const x = BigNumber.from(i).mul(24).toNumber();
        const y = BigNumber.from(i).div(16).mul(24).toNumber();
        const _ids = await mintLands(land, to, 24, x, y);
        ids = ids.concat(_ids);
    }
    return ids;
}

export async function logPools(landPool: LandPool, sandPool: SandPool, contract: DefiWrapSandboxStaking) {
    const landPoolBalance = await landPool.balanceOf(contract.address);
    const sandPoolBalance = await sandPool.balanceOf(contract.address);
    console.info("landPoolBalance:", utils.formatEther(landPoolBalance));
    console.info("sandPoolBalance:", utils.formatEther(sandPoolBalance));
}
export async function logEarned(signer: SignerWithAddress, contract: DefiWrapSandboxStaking) {
    console.info(AddName[signer.address] + ":");
    const earned = await contract.earned(signer.address);
    const earnedTx = await contract.earnedTx(signer.address);
    const earnedLocked = await contract.earnedLocked(signer.address);
    console.info("earned:", utils.formatEther(earned[0]), "--", utils.formatEther(earned[1]));
    console.info("earnedTx:", utils.formatEther(earnedTx[0]), "--", utils.formatEther(earnedTx[1]));
    console.info("earnedLocked:", utils.formatEther(earnedLocked[0]), "--", utils.formatEther(earnedLocked[1]));
    const defiEarned = await contract.defiEarned();
    console.info("defiEarned:", utils.formatEther(defiEarned));
}

export async function earnedPools(landPool: LandPool, sandPool: SandPool, contract: DefiWrapSandboxStaking) {
    return (await landPool.earned(contract.address)).add(await sandPool.earned(contract.address));
}

export async function assertAbsSands(
    sand1: BigNumber,
    sand2: BigNumber,
    msg: string,
    abs: BigNumber = BigNumber.from("100000")
) {
    const mAbs = sand1.gt(sand2) ? sand1.sub(sand2) : sand2.sub(sand1);
    expect(mAbs.lte(abs), `${msg}: ${sand1.toString()} -- ${sand2.toString()}`).to.be.true;
}
