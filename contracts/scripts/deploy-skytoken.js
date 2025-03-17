// scripts/deploy-skytoken.js
const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("Deploying SkyToken contract...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  
  // Get starting balance for comparison
  const initialBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.utils.formatEther(initialBalance)} ETH`);

  // Create a separate treasury account
  // In production, you should use a real treasury address with multi-sig security
  const treasuryWallet = ethers.Wallet.createRandom().connect(ethers.provider);
  console.log(`Treasury address: ${treasuryWallet.address}`);

  // Deploy the token contract
  const initialSupply = ethers.utils.parseEther("100000000"); // 100 million tokens
  const SkyToken = await ethers.getContractFactory("SkyToken");
  const skyToken = await SkyToken.deploy(initialSupply, treasuryWallet.address);
  
  await skyToken.deployed();
  console.log(`SkyToken deployed to: ${skyToken.address}`);

  // Set up roles for the game server (in this example, we'll use the deployer as the game server)
  const GAME_SERVER_ROLE = await skyToken.GAME_SERVER_ROLE();
  await skyToken.grantRole(GAME_SERVER_ROLE, deployer.address);
  console.log(`Granted GAME_SERVER_ROLE to: ${deployer.address}`);

  // Set up a test reward distributor role
  const REWARD_DISTRIBUTOR_ROLE = await skyToken.REWARD_DISTRIBUTOR_ROLE();
  await skyToken.grantRole(REWARD_DISTRIBUTOR_ROLE, deployer.address);
  console.log(`Granted REWARD_DISTRIBUTOR_ROLE to: ${deployer.address}`);

  // Add some initial items to the store
  console.log("Adding initial items to the game store...");
  
  await skyToken.addItem("Basic Plane Skin", ethers.utils.parseEther("100"));
  await skyToken.addItem("Premium Plane Model", ethers.utils.parseEther("500"));
  await skyToken.addItem("Special Weapon", ethers.utils.parseEther("250"));
  await skyToken.addItem("Extra Fuel Tank", ethers.utils.parseEther("150"));
  await skyToken.addItem("Advanced Radar", ethers.utils.parseEther("300"));
  
  console.log("Added 5 initial items to the store");

  // Get ending balance and calculate gas used
  const finalBalance = await ethers.provider.getBalance(deployer.address);
  const gasUsed = initialBalance.sub(finalBalance);
  console.log(`Deployment complete! Gas used: ${ethers.utils.formatEther(gasUsed)} ETH`);

  // Log contract information for verification
  console.log("\nDeployment Summary:");
  console.log("-------------------");
  console.log(`SkyToken Address: ${skyToken.address}`);
  console.log(`Treasury Address: ${treasuryWallet.address}`);
  console.log(`Initial Supply: ${ethers.utils.formatEther(initialSupply)} SKY`);
  console.log(`Total Items: ${await skyToken.itemCount()}`);
  console.log(`Transfer Fee: ${await skyToken.transferFeePercentage()}%`);
  console.log(`Max Daily Reward: ${ethers.utils.formatEther(await skyToken.maxDailyReward())} SKY`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });