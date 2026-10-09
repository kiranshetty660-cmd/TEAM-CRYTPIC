import hashlib
import time
from typing import Optional
from sqlalchemy.orm import Session
from app.models import Ledger, Anchor
from app.ledger.merkle import compute_merkle_root
from app.config import settings

def anchor_range(db: Session, from_seq: int, to_seq: int) -> Anchor:
    """
    Computes Merkle root for ledger events between from_seq and to_seq inclusive.
    Attempts EVM anchor if configured; falls back to simulated anchor.
    """
    entries = db.query(Ledger).filter(Ledger.seq >= from_seq, Ledger.seq <= to_seq).order_by(Ledger.seq.asc()).all()
    if not entries:
        raise ValueError(f"No ledger entries found in range {from_seq}..{to_seq}")

    hashes = [e.hash for e in entries]
    root = compute_merkle_root(hashes)

    chain = "simulated"
    tx_hash = f"0xsim_{hashlib.sha256(f'{root}_{from_seq}_{to_seq}_{time.time()}'.encode()).hexdigest()[:40]}"
    status = "confirmed"

    # Try live EVM on Polygon Amoy if environment variables provided
    if settings.CHAIN_RPC_URL and settings.CHAIN_PRIVATE_KEY and settings.ANCHOR_CONTRACT_ADDRESS:
        try:
            from web3 import Web3
            w3 = Web3(Web3.HTTPProvider(settings.CHAIN_RPC_URL))
            if w3.is_connected():
                account = w3.eth.account.from_key(settings.CHAIN_PRIVATE_KEY)
                contract_abi = [
                    {
                        "inputs": [
                            {"internalType": "bytes32", "name": "root", "type": "bytes32"},
                            {"internalType": "uint256", "name": "fromSeq", "type": "uint256"},
                            {"internalType": "uint256", "name": "toSeq", "type": "uint256"}
                        ],
                        "name": "anchor",
                        "outputs": [],
                        "stateMutability": "nonpayable",
                        "type": "function"
                    }
                ]
                contract = w3.eth.contract(address=w3.to_checksum_address(settings.ANCHOR_CONTRACT_ADDRESS), abi=contract_abi)
                # Ensure bytes32 format
                root_bytes = bytes.fromhex(root[2:] if root.startswith("0x") else root)
                tx = contract.functions.anchor(root_bytes, from_seq, to_seq).build_transaction({
                    "from": account.address,
                    "nonce": w3.eth.get_transaction_count(account.address),
                    "gas": 150000,
                    "maxFeePerGas": w3.to_wei("35", "gwei"),
                    "maxPriorityFeePerGas": w3.to_wei("30", "gwei"),
                })
                signed_tx = w3.eth.account.sign_transaction(tx, private_key=settings.CHAIN_PRIVATE_KEY)
                tx_hash_bytes = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
                tx_hash = w3.to_hex(tx_hash_bytes)
                chain = "amoy"
        except Exception as e:
            # Fall back to simulated
            chain = "simulated"
            tx_hash = f"0xsim_{hashlib.sha256(f'fallback_{root}_{from_seq}_{to_seq}'.encode()).hexdigest()[:40]}"

    anchor = Anchor(
        from_seq=from_seq,
        to_seq=to_seq,
        merkle_root=root,
        tx_hash=tx_hash,
        chain=chain,
        status=status,
    )
    db.add(anchor)
    db.commit()
    db.refresh(anchor)
    return anchor
