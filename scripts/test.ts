import {ethers} from "hardhat";
const {utils} = ethers;

const total = utils.parseEther("10000000000");
const encodedAmount = utils.defaultAbiCoder.encode(["uint256"], [total.toString()]);
console.info('mint:', encodedAmount)
const pool = utils.parseEther("800000");
console.info('pool', pool.toString())