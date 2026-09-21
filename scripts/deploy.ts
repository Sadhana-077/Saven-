import { network } from "hardhat";

const { ethers } = await network.connect();

const implementation = await ethers.deployContract("SavenWallet");

await implementation.waitForDeployment();

console.log("SavenWallet Implementation:", await implementation.getAddress());