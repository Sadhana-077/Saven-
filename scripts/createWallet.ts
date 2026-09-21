import { network } from "hardhat";

const { ethers } = await network.connect();

const [owner] = await ethers.getSigners();

const factory = await ethers.getContractAt(
  "SavenWalletFactory",
  "0x81D3756B1D8a811B7AC1e22868e8AeB0283246aE"
);

const owners = [owner.address];
const threshold = 1;
const recoveryAddress = owner.address;
const recoveryDelay = 86400;

const tx = await factory.createWallet(
  owners,
  threshold,
  recoveryAddress,
  recoveryDelay
);

const receipt = await tx.wait();

console.log("Wallet creation transaction:", receipt?.hash);

const wallets = await factory.getWallets();

console.log("Saven Wallet Proxy:", wallets[wallets.length - 1]);