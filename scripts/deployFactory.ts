import { network } from "hardhat";

const { ethers } = await network.connect();

const implementationAddress =
  "0x96eA00D67764013530bbd83c63DE428799cf527a";

const factory = await ethers.deployContract(
  "SavenWalletFactory",
  [implementationAddress]
);

await factory.waitForDeployment();

console.log(
  "SavenWallet Factory:",
  await factory.getAddress()
);