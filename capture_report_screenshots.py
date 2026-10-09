import subprocess
import time
import os

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
out_dir = r"D:\Team_Cryptic\report_assets"
os.makedirs(out_dir, exist_ok=True)

targets = [
    ("http://localhost:3000", os.path.join(out_dir, "01_compliance_board.png")),
    ("http://localhost:3000/cases", os.path.join(out_dir, "02_closed_loop_cases.png")),
    ("http://localhost:3000/agents", os.path.join(out_dir, "03_agent_monitor.png")),
    ("http://localhost:3000/trace", os.path.join(out_dir, "04_batch_trace.png")),
    ("http://localhost:3000/approvals", os.path.join(out_dir, "05_approvals_queue.png")),
    ("http://localhost:3000/inventory", os.path.join(out_dir, "06_inventory_import.png")),
    ("http://localhost:3000/verify", os.path.join(out_dir, "07_ledger_verify.png")),
    ("http://localhost:3000/findings/FIND-REC-REC-2026-B2231", os.path.join(out_dir, "08_finding_detail.png")),
]

for url, out_path in targets:
    print(f"Capturing {url} -> {out_path}...")
    args = [
        edge_path,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--virtual-time-budget=3000",
        f"--screenshot={out_path}",
        "--window-size=1280,950",
        url
    ]
    subprocess.run(args, check=True)
    time.sleep(1)

print("All screenshots successfully captured!")
