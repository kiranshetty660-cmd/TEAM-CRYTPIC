from typing import List, Dict, Any

def allocate_clean_stock(
    clean_qty: int,
    customers: List[Dict[str, Any]],
    is_critical_drug: bool = False
) -> Dict[str, Any]:
    """
    Allocates clean stock deterministically:
    1. Critical drug & hospitals first
    2. Then chemists by prior recalled volume descending
    3. Then credit terms (stricter / shorter terms first)
    Hard invariant: total allocated NEVER exceeds clean_qty.
    """
    if clean_qty <= 0:
        return {
            "clean_qty": clean_qty,
            "total_allocated": 0,
            "unallocated_clean": 0,
            "shortfall": sum(c.get("demand", c.get("dispatched_qty", 0)) for c in customers),
            "allocations": [
                {**c, "allocated_qty": 0, "fill_rate_pct": 0.0} for c in customers
            ]
        }

    # Credit terms numeric mapping (e.g., Net 15 > Net 30 > Net 45)
    def credit_term_priority(term: str) -> int:
        if "15" in term:
            return 1
        if "30" in term:
            return 2
        if "45" in term:
            return 3
        return 4

    # Priority sorting key
    def sort_key(c: Dict[str, Any]):
        c_type = c.get("type", "chemist")
        is_hosp = (c_type == "hospital")
        prior_vol = c.get("recalled_volume", c.get("dispatched_qty", 0))
        terms = c.get("credit_terms", "Net 30")

        # 0 for critical drug hospital, 1 for regular hospital, 2 for chemist
        if is_critical_drug and is_hosp:
            category_rank = 0
        elif is_hosp:
            category_rank = 1
        else:
            category_rank = 2

        return (
            category_rank,
            -prior_vol,  # higher recalled volume first
            credit_term_priority(terms),
            c.get("customer_id", "")
        )

    sorted_customers = sorted(customers, key=sort_key)

    remaining_clean = clean_qty
    allocations = []
    total_shortfall = 0

    for c in sorted_customers:
        needed = c.get("demand", c.get("dispatched_qty", 0))
        grant = min(needed, remaining_clean)
        remaining_clean -= grant
        shortfall = max(0, needed - grant)
        total_shortfall += shortfall

        allocations.append({
            "customer_id": c.get("customer_id"),
            "name": c.get("name"),
            "type": c.get("type"),
            "demand": needed,
            "allocated_qty": grant,
            "fill_rate_pct": round((grant / needed * 100.0) if needed > 0 else 100.0, 1),
            "shortfall": shortfall,
        })

    total_allocated = clean_qty - remaining_clean
    assert total_allocated <= clean_qty, "CRITICAL ERROR: total_allocated exceeds clean_qty!"

    return {
        "clean_qty": clean_qty,
        "total_allocated": total_allocated,
        "unallocated_clean": remaining_clean,
        "shortfall": total_shortfall,
        "allocations": allocations,
    }
