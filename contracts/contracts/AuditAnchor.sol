// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AuditAnchor
 * @notice Tamper-evident periodic Merkle root anchor for TraceRx pharma compliance ledger.
 */
contract AuditAnchor {
    event Anchored(
        uint256 indexed id,
        bytes32 root,
        uint256 fromSeq,
        uint256 toSeq,
        uint256 ts
    );

    uint256 public count;

    function anchor(bytes32 root, uint256 fromSeq, uint256 toSeq) external {
        emit Anchored(++count, root, fromSeq, toSeq, block.timestamp);
    }
}
