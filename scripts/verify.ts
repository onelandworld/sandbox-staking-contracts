import {ethers, network, run} from "hardhat";
import {getJson, writeJson} from "./json";
const json = getJson();

const signer = ethers.provider.getSigner();

function getErrorMsg(error: any): string {
    if (error && typeof error == "string") return error;
    if (error && typeof error.message === "string") return error.message;
    if (error && typeof error.msg === "string") return error.msg;
    return "Unknown error";
}
async function verify(contractAdd: string, args: any[] = [], times: number = 0) {
    try {
        if (json[contractAdd]) {
            console.info("Allready Verifed:" + contractAdd);
            return;
        }
        await run("verify:verify", {
            address: contractAdd,
            constructorArguments: args,
        });
        json[contractAdd] = true;
        writeJson(json);
        console.info("Verifed:" + contractAdd);
    } catch (error) {
        if (getErrorMsg(error).includes("Already Verified")) {
            return;
        } else if (times >= 3) {
            console.info("verifyError:" + JSON.stringify(error));
            return;
        } else {
            console.info(`retry Verify: ${times + 1}`);
            await verify(contractAdd, args, times + 1);
        }
    }
}

async function main() {
    const address = await signer.getAddress();
    const {
        trusted,
        sand,
        land,
        landPool,
        sandPool,
        landPoolCalculator,
        sandPoolCalculator,
        sandContirbutionCalclator,
        defi,
    } = json;
    if (network.name === "polygon-mainnet") {
        if (defi && sand && land && landPool && sandPool) {
            await verify(defi, [sand, land, landPool, sandPool]);
        }
    } else if (network.name === "polygon-mainnet-pre") {
        trusted && (await verify(trusted));
        trusted && sand && (await verify(sand, [address, trusted, address, address]));
        trusted && sandPool && sand && land && (await verify(sandPool, [sand, sand, trusted]));
        trusted && landPool && sand && land && (await verify(landPool, [sand, sand, trusted]));
        landPoolCalculator && landPool && (await verify(landPoolCalculator, [landPool]));
        sandPoolCalculator && sandPool && (await verify(sandPoolCalculator, [sandPool]));
        sandContirbutionCalclator && land && (await verify(sandContirbutionCalclator, [land]));
        defi && sand && land && landPool && sandPool && (await verify(defi, [sand, land, landPool, sandPool]));
    } else if (network.name === "polygon-mumbai" || network.name === "goerli") {
        trusted && (await verify(trusted));
        land && (await verify(land));
        trusted && sand && (await verify(sand, [address, trusted, address, address]));
        trusted && sandPool && sand && land && (await verify(sandPool, [sand, sand, trusted]));
        trusted && landPool && sand && land && (await verify(landPool, [sand, sand, trusted]));
        landPoolCalculator && landPool && (await verify(landPoolCalculator, [landPool]));
        sandPoolCalculator && sandPool && (await verify(sandPoolCalculator, [sandPool]));
        sandContirbutionCalclator && land && (await verify(sandContirbutionCalclator, [land]));
        defi && sand && land && landPool && sandPool && (await verify(defi, [sand, land, landPool, sandPool]));
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
