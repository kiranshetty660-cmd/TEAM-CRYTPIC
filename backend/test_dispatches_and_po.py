import requests
import json
import io

BASE_URL = "http://localhost:8000"

def test_purchase_orders():
    print("--- Testing purchase_orders Profile, Validate, Commit ---")
    po_csv = (
        "po,manufacturer,sku,qty,expected_date,status\n"
        "PO-2026-901,Cipla,AMOX-625,100,2026-10-15,ordered\n"
        "PO-2026-902,Sun Pharma,PARA-500,250,2026-10-18,in transit\n"
    )
    
    # 1. Profile
    files = {"file": ("purchase_orders.csv", po_csv.encode("utf-8"), "text/csv")}
    data = {"target_table": "purchase_orders"}
    resp = requests.post(f"{BASE_URL}/api/data/profile", files=files, data=data)
    print(f"PO Profile Status: {resp.status_code}")
    assert resp.status_code == 200, resp.text
    profile_data = resp.json()
    assert profile_data["is_valid_for_commit"] is True
    print(f"PO Profile Total Rows: {profile_data['total_rows']}, Status: {profile_data['status']}")

    # 2. Validate
    files = {"file": ("purchase_orders.csv", po_csv.encode("utf-8"), "text/csv")}
    val_data = {
        "target_table": "purchase_orders",
        "mapping_json": json.dumps(profile_data["mapping_analysis"]["mapping"])
    }
    resp = requests.post(f"{BASE_URL}/api/data/validate", files=files, data=val_data)
    print(f"PO Validate Status: {resp.status_code}")
    assert resp.status_code == 200, resp.text
    val_res = resp.json()
    import_id = val_res["import_id"]
    print(f"PO Valid Rows: {val_res['valid_rows_count']}, Invalid: {val_res['invalid_rows_count']}, Import ID: {import_id}")

    # 3. Commit
    commit_data = {"import_id": import_id, "imported_by": "Test Suite"}
    resp = requests.post(f"{BASE_URL}/api/data/commit", data=commit_data)
    print(f"PO Commit Status: {resp.status_code}")
    assert resp.status_code == 200, resp.text
    commit_res = resp.json()
    print(f"PO Committed Rows: {commit_res['committed_rows']}")
    assert commit_res["committed_rows"] == 2
    print("PO End-to-end Test PASSED!\n")


def test_dispatches_whole_dataset():
    print("--- Testing dispatches Profile, Validate, Commit (Whole Dataset) ---")
    # 6 diverse rows
    dispatch_csv = (
        "date,customer,sku,batch,qty\n"
        "2026-09-01,HOSP-AIIMS,AMOX-625,B-AMOX-01,50\n"
        "2026-09-03,CHEM-APOLLO,PARA-500,B-PARA-02,120\n"
        "04-09-2026,HOSP-MAX,AZITH-500,B-AZITH-03,30\n"
        "2026/09/05,CHEM-MEDPLUS,AMOX-625,B-AMOX-01,80\n"
        "06-Sep-2026,HOSP-FORTIS,PARA-500,B-PARA-02,200\n"
        "2026-09-07,CHEM-LOCAL,AZITH-500,B-AZITH-03,15\n"
    )

    # 1. Profile
    files = {"file": ("dispatches.csv", dispatch_csv.encode("utf-8"), "text/csv")}
    data = {"target_table": "dispatches"}
    resp = requests.post(f"{BASE_URL}/api/data/profile", files=files, data=data)
    print(f"Dispatches Profile Status: {resp.status_code}")
    assert resp.status_code == 200, resp.text
    profile_data = resp.json()
    print(f"Dispatches Profile Total Rows: {profile_data['total_rows']}, Is Valid: {profile_data['is_valid_for_commit']}")
    assert profile_data["total_rows"] == 6

    # 2. Validate
    files = {"file": ("dispatches.csv", dispatch_csv.encode("utf-8"), "text/csv")}
    val_data = {
        "target_table": "dispatches",
        "mapping_json": json.dumps(profile_data["mapping_analysis"]["mapping"])
    }
    resp = requests.post(f"{BASE_URL}/api/data/validate", files=files, data=val_data)
    print(f"Dispatches Validate Status: {resp.status_code}")
    assert resp.status_code == 200, resp.text
    val_res = resp.json()
    import_id = val_res["import_id"]
    print(f"Dispatches Valid Rows: {val_res['valid_rows_count']}, Invalid: {val_res['invalid_rows_count']}")
    if val_res["errors"]:
        print(f"Errors: {val_res['errors']}")
    assert val_res["valid_rows_count"] == 6
    assert val_res["invalid_rows_count"] == 0

    # 3. Commit
    commit_data = {"import_id": import_id, "imported_by": "Test Suite"}
    resp = requests.post(f"{BASE_URL}/api/data/commit", data=commit_data)
    print(f"Dispatches Commit Status: {resp.status_code}")
    assert resp.status_code == 200, resp.text
    commit_res = resp.json()
    print(f"Dispatches Committed Rows: {commit_res['committed_rows']} / 6")
    assert commit_res["committed_rows"] == 6, f"Expected 6 committed rows, got {commit_res['committed_rows']}"
    print("Dispatches Whole Dataset End-to-end Test PASSED!\n")

if __name__ == "__main__":
    test_purchase_orders()
    test_dispatches_whole_dataset()
