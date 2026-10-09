const hre = require("hardhat");

async function main() {
  console.log("Deploying TraceRx AuditAnchor to", hre.network.name);

  const AuditAnchor = await hre.ethers.getContractFactory("AuditAnchor");
  const anchor = await AuditAnchor.deploy();
  await anchor.waitForDeployment();

  const address = await anchor.getAddress();
  console.log(`AuditAnchor deployed successfully at: ${address}`);
  console.log("Update ANCHOR_CONTRACT_ADDRESS in .env with this address.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
