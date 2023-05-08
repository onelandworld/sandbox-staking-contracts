import {SandPool} from "./../typechain-types/contracts/sandbox/SandPool";
import {Sand} from "./../typechain-types/contracts/sandbox/Sand";
import {LandPool} from "./../typechain-types/contracts/sandbox/LandPool";
import {DefiWrapSandboxStaking__factory} from "./../typechain-types/factories/contracts/DefiWrapSandboxStaking__factory";
import {LandContributionCalculator__factory} from "./../typechain-types/factories/contracts/sandbox/lib/LandContributionCalculator__factory";
import {TwoPeriodsRewardCalculator__factory} from "./../typechain-types/factories/contracts/sandbox/lib/TwoPeriodsRewardCalculator__factory";
import {SandPool__factory} from "./../typechain-types/factories/contracts/sandbox/SandPool__factory";
import {LandPool__factory} from "./../typechain-types/factories/contracts/sandbox/LandPool__factory";
import {Sand__factory} from "./../typechain-types/factories/contracts/sandbox/Sand__factory";
import {Forwarder__factory} from "./../typechain-types/factories/contracts/sandbox/forwarder/Forwarder__factory";
import {time} from "@nomicfoundation/hardhat-network-helpers";
import {ethers, network, upgrades} from "hardhat";
import {Land, Land__factory} from "../typechain-types";
import {getJson, writeJson} from "./json";
const {utils} = ethers;
const signer = ethers.provider.getSigner();
const json = getJson();
console.info("json:", json);

export async function deployTrusted() {
    if (json.trusted) return Forwarder__factory.connect(json.trusted, signer);
    const factory = await ethers.getContractFactory("Forwarder");
    const contract = await factory.deploy();
    json.trusted = contract.address;
    writeJson(json);
    return contract;
}

export async function deployLand(trusted: string) {
    if (json.land) return Land__factory.connect(json.land, signer);
    const factory = await ethers.getContractFactory("Land");
    const contract = await upgrades.deployProxy(factory, [trusted]);
    json.land = contract.address;
    writeJson(json);
    // const impl = await upgrades.erc1967.getImplementationAddress(contract.address);
    const land = Land__factory.connect(contract.address, signer);
    await land.connect(signer).setMinter(signer.getAddress(), true);
    return land;
}

export async function deploySand(trusted: string) {
    if (json.sand) return Sand__factory.connect(json.sand, signer);
    const factory = await ethers.getContractFactory("Sand");
    const address = await signer.getAddress();
    const sand = await factory.connect(signer).deploy(address, trusted, address, address);
    json.sand = sand.address;
    writeJson(json);
    const total = utils.parseEther("10000000000");
    const encodedAmount = utils.defaultAbiCoder.encode(["uint256"], [total.toString()]);
    const tx = await sand.connect(signer).deposit(signer.getAddress(), encodedAmount);
    await tx.wait();
    return sand;
}

export async function deployLandPool(stake: string, reward: string, trusted: string) {
    if (json.landPool) return LandPool__factory.connect(json.landPool, signer);
    const factory = await ethers.getContractFactory("LandPool");
    const contract = await factory.connect(signer).deploy(stake, reward, trusted);
    json.landPool = contract.address;
    writeJson(json);
    return contract;
}

export async function deploySandPool(stake: string, reward: string, trusted: string) {
    if (json.sandPool) return SandPool__factory.connect(json.sandPool, signer);
    const factory = await ethers.getContractFactory("SandPool");
    const contract = await factory.connect(signer).deploy(stake, reward, trusted);
    json.sandPool = contract.address;
    writeJson(json);
    return contract;
}

export async function deployRewardCalculator(pool: string) {
    const factory = await ethers.getContractFactory("TwoPeriodsRewardCalculator");
    const contract = await factory.connect(signer).deploy(pool);
    await contract.connect(signer).grantRole(await contract.REWARD_DISTRIBUTION(), signer.getAddress());
    return contract;
}

export async function deployLandContributionCalculator(land: string) {
    const factory = await ethers.getContractFactory("LandContributionCalculator");
    const contract = await factory.connect(signer).deploy(land);
    return contract;
}

export async function deployDefi(sand: string, land: string, landPool: string, sandPool: string) {
    if (json.defi) return DefiWrapSandboxStaking__factory.connect(json.defi, signer);
    const factory = await ethers.getContractFactory("DefiWrapSandboxStaking");
    const defi = await factory.connect(signer).deploy(sand, land, landPool, sandPool);
    await defi.deployed();
    json.defi = defi.address;
    writeJson(json);
    return defi;
}

export async function initLandPool(landPool: LandPool, sand: Sand, land: Land) {
    if (json.landPoolCalculator) return TwoPeriodsRewardCalculator__factory.connect(json.landPoolCalculator, signer);
    const weeks4 = time.duration.weeks(4);
    await landPool
        .connect(signer)
        .setERC721RequirementList(land.address, [], true, 1, utils.parseUnits("2000", 18), 0, 0);
    const landPoolCalculator = await deployRewardCalculator(landPool.address);
    json.landPoolCalculator = landPoolCalculator.address;
    writeJson(json);
    await landPoolCalculator.connect(signer).setInitialCampaign(utils.parseUnits("800000", 18), weeks4);
    await landPoolCalculator.connect(signer).updateNextCampaign(utils.parseUnits("800000", 18), weeks4);
    await landPool.connect(signer).setRewardCalculator(landPoolCalculator.address, true);
    await landPool.connect(signer).setTimelockClaim(time.duration.minutes(10));
    await sand.connect(signer).transfer(landPool.address, utils.parseUnits("1600000", 18));
}

export async function initSandPool(sandPool: SandPool, sand: Sand) {
    if (json.sandPoolCalculator) return TwoPeriodsRewardCalculator__factory.connect(json.sandPoolCalculator, signer);
    const weeks4 = time.duration.weeks(4);
    const sandPoolCalculator = await deployRewardCalculator(sandPool.address);
    json.sandPoolCalculator = sandPoolCalculator.address;
    writeJson(json);
    await sandPoolCalculator.connect(signer).setInitialCampaign(utils.parseUnits("800000", 18), weeks4);
    await sandPoolCalculator.connect(signer).updateNextCampaign(utils.parseUnits("800000", 18), weeks4);
    await sandPool.connect(signer).setRewardCalculator(sandPoolCalculator.address, true);
    await sandPool.connect(signer).setAntiCompoundLockPeriod(time.duration.minutes(10));
    await sand.connect(signer).transfer(sandPool.address, utils.parseUnits("1600000", 18));
}

export async function initSandPoolContribution(sandPool: SandPool, land: Land) {
    if (json.sandContirbutionCalclator)
        return LandContributionCalculator__factory.connect(json.sandContirbutionCalclator, signer);
    const sandContirbutionCalclator = await deployLandContributionCalculator(land.address);
    json.sandContirbutionCalclator = sandContirbutionCalclator.address;
    writeJson(json);
    await sandPool.connect(signer).setContributionCalculator(sandContirbutionCalclator.address);
    return sandContirbutionCalclator;
}

async function main() {
    if (network.name === "polygon-mainnet") {
        json.sand &&
            json.land &&
            json.landPool &&
            json.sandPool &&
            (await deployDefi(json.sand, json.land, json.landPool, json.sandPool));
    } else if (network.name === "polygon-mumbai" || network.name === "goerli") {
        const trusted = await deployTrusted();
        const sand = await deploySand(trusted.address);
        const land = await deployLand(trusted.address);
        const sandPool = await deploySandPool(sand.address, sand.address, trusted.address);
        const landPool = await deployLandPool(sand.address, sand.address, trusted.address);
        // landPool init
        await initLandPool(landPool, sand, land);
        // sandPool init
        await initSandPool(sandPool, sand);
        await initSandPoolContribution(sandPool, land);
        await deployDefi(sand.address, land.address, landPool.address, sandPool.address);
    } else if (network.name === "polygon-mainnet-pre") {
        // const sandAddress = "0xBbba073C31bF03b8ACf7c28EF0738DeCF3695683";
        const trusted = await deployTrusted();
        const landAddress = "0x9d305a42A3975Ee4c1C57555BeD5919889DCE63F";
        if (!json.land) return;
        const land = await deployLand(trusted.address);
        const sand = await deploySand(trusted.address);
        const sandPool = await deploySandPool(sand.address, sand.address, trusted.address);
        const landPool = await deployLandPool(sand.address, sand.address, trusted.address);

        // landPool init
        await initLandPool(landPool, sand, land);
        // sandPool init
        await initSandPool(sandPool, sand);
        await initSandPoolContribution(sandPool, land);

        await deployDefi(sand.address, landAddress, landPool.address, sandPool.address);
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
