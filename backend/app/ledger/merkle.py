import hashlib
from typing import List

def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def compute_merkle_root(hashes: List[str]) -> str:
    """
    Computes a Merkle root over an array of SHA-256 hexadecimal strings.
    If empty, returns 64 zeroes.
    If odd number of leaves at any level, duplicates the last leaf.
    """
    if not hashes:
        return "0" * 64
    
    current_level = [bytes.fromhex(h) if len(h) == 64 else hashlib.sha256(h.encode()).digest() for h in hashes]
    
    while len(current_level) > 1:
        if len(current_level) % 2 != 0:
            current_level.append(current_level[-1])
        next_level = []
        for i in range(0, len(current_level), 2):
            combined = current_level[i] + current_level[i + 1]
            next_level.append(hashlib.sha256(combined).digest())
        current_level = next_level

    return "0x" + current_level[0].hex()
