import {HardhatUserConfig} from "hardhat/config";
import {NetworkUserConfig, NetworksUserConfig} from "hardhat/types";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-abi-exporter";
import "hardhat-gas-reporter";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import _ from "lodash";
import dotenv from "dotenv";
dotenv.config();

const chainIds = {
    // mainnet: 1,
    goerli: 5,

    "polygon-mainnet": 137,
    "polygon-mainnet-pre": 137,
    "polygon-mumbai": 80001,
};

const privateKey: string = process.env.PRIVATE_KEY || "";
const infuraKey: string = process.env.INFURA_KEY || "";

function createNetConfig(network: keyof typeof chainIds): NetworkUserConfig | null {
    if (!infuraKey || !privateKey) {
        console.info("warn please set PRIVATE_KEY and INFURA_KEY fro goerli and mainnet");
        return null;
    }
    const base = network.endsWith("-pre") ? network.substring(0, network.length - 4) : network;
    return {
        chainId: chainIds[network],
        url: `https://${base}.infura.io/v3/${infuraKey}`,
        accounts: [`${privateKey}`],
    };
}

function createNetworks(): NetworksUserConfig {
    const config: NetworksUserConfig = {};
    for (const net in chainIds) {
        const netconfig = createNetConfig(net as any);
        if (netconfig) config[net] = netconfig;
    }
    return config;
}

const config: HardhatUserConfig = {
    paths: {
        artifacts: "./artifacts",
        cache: "./cache",
        sources: "./contracts",
        tests: "./test",
    },
    solidity: {
        compilers: [
            {
                version: "0.8.12",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 2000,
                    },
                },
            },
            {
                version: "0.8.2",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 2000,
                    },
                },
            },
            {
                version: "0.6.2",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 2000,
                    },
                },
            },
        ],
    },

    mocha: {
        parallel: false,
    },
    typechain: {
        outDir: "typechain-types",
        target: "ethers-v5",
        alwaysGenerateOverloads: true,
    },

    etherscan: {
        apiKey: {
            mainnet: process.env.ETHERSCAN_KEY || "",
            rinkeby: process.env.ETHERSCAN_KEY || "",
            goerli: process.env.ETHERSCAN_KEY || "",
            "polygon-mainnet": process.env.POLYGONSCAN_KEY || "",
            "polygon-mainnet-pre": process.env.POLYGONSCAN_KEY || "",
            "polygon-mumbai": process.env.POLYGONSCAN_KEY || "",
        },
        customChains: [
            {
                network: "polygon-mainnet",
                chainId: chainIds["polygon-mainnet"],
                urls: {
                    apiURL: "https://api.polygonscan.com/api",
                    browserURL: "https://polygonscan.com",
                },
            },
            {
                network: "polygon-mainnet-pre",
                chainId: chainIds["polygon-mainnet-pre"],
                urls: {
                    apiURL: "https://api.polygonscan.com/api",
                    browserURL: "https://polygonscan.com",
                },
            },
            {
                network: "polygon-mumbai",
                chainId: chainIds["polygon-mumbai"],
                urls: {
                    apiURL: "https://api-testnet.polygonscan.com/api",
                    browserURL: "https://mumbai.polygonscan.com",
                },
            },
        ],
    },
    gasReporter: {
        coinmarketcap: process.env.COINMARKETCAP_KEY,
        currency: "USD",
        enabled: process.env.REPORT_GAS ? true : false,
        
    },
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            chainId: 1337,
        },
        ...createNetworks(),
    },
};

export default config;
