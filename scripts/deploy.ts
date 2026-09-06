import { network } from "hardhat";

const { ethers } = await network.connect();

const [owner] = await ethers.getSigners();

const wallet = await ethers.deployContract("SmartContractWallet", [
  owner.address,
]);

await wallet.waitForDeployment();

console.log("Owner EOA:", owner.address);
console.log("Smart Contract Wallet:", await wallet.getAddress());