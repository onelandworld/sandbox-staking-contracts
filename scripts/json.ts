import { readFileSync, writeFileSync } from "fs";
import { network } from "hardhat";

export interface DeployedJson {
    trusted?: string;
    sand?: string;
    land?: string;
    sandPool?: string;
    landPool?: string;
    landPoolCalculator?: string;
    sandPoolCalculator?: string;
    sandContirbutionCalclator?: string;
    defi?: string;
}

export type DeployedVerifyJson = DeployedJson & { [k: string]: boolean } 
export function getJson(): DeployedVerifyJson {
    const json = readFileSync("./json/" + network.name + ".json", "utf-8");
    const dto = JSON.parse(json) as any;
    return dto;
}

export function writeJson(dto: DeployedVerifyJson) {
    writeFileSync("./json/" + network.name + ".json", JSON.stringify(dto, undefined, "\n"));
}
