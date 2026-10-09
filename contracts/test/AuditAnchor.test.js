const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AuditAnchor Contract", function () {
  let anchor;

  beforeEach(async function () {
    const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
    anchor = await AuditAnchor.deploy();
    await anchor.waitForDeployment();
  });

  it("should initialize with count = 0", async function () {
    expect(await anchor.count()).to.equal(0);
  });

  it("should anchor Merkle root and emit Anchored event", async function () {
    const dummyRoot = ethers.keccak256(ethers.toUtf8Bytes("merkle_root_test_leaves_1_to_20"));
    const fromSeq = 1;
    const toSeq = 20;

    const tx = await anchor.anchor(dummyRoot, fromSeq, toSeq);
    const receipt = await tx.wait();

    expect(await anchor.count()).to.equal(1);

    // Verify event emission
    await expect(tx)
      .to.emit(anchor, "Anchored")
      .withArgs(1, dummyRoot, fromSeq, toSeq, (await ethers.provider.getBlock(receipt.blockNumber)).timestamp);
  });

  it("should increment counter on subsequent anchors", async function () {
    const root1 = ethers.keccak256(ethers.toUtf8Bytes("root1"));
    const root2 = ethers.keccak256(ethers.toUtf8Bytes("root2"));

    await anchor.anchor(root1, 1, 20);
    await anchor.anchor(root2, 21, 40);

    expect(await anchor.count()).to.equal(2);
  });
});
