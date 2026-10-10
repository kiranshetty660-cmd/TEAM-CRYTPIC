import subprocess
import time
import os

browser_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(browser_path):
    browser_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

out_dir = r"D:\Team_Cryptic\report_assets\responsive_test"
os.makedirs(out_dir, exist_ok=True)

viewports = [
    ("mobile", "390,844"),
    ("tablet", "768,1024"),
    ("desktop", "1440,900"),
]

routes = [
    ("dashboard", "http://localhost:3000/"),
    ("recall_demo", "http://localhost:3000/recall-demo"),
    ("cases", "http://localhost:3000/cases"),
    ("trace_b2231", "http://localhost:3000/trace?batch=B2231"),
    ("approvals", "http://localhost:3000/approvals"),
    ("verify_ledger", "http://localhost:3000/verify"),
    ("inventory", "http://localhost:3000/inventory"),
    ("notifications", "http://localhost:3000/notifications"),
    ("purchase_orders", "http://localhost:3000/purchase-orders"),
    ("agents", "http://localhost:3000/agents"),
    ("findings", "http://localhost:3000/findings"),
]

print(f"Using browser: {browser_path}")
total_tests = len(viewports) * len(routes)
count = 0

for vp_name, vp_size in viewports:
    print(f"\n==========================================")
    print(f"TESTING VIEWPORT: {vp_name.upper()} ({vp_size})")
    print(f"==========================================")
    for route_name, url in routes:
        count += 1
        out_file = os.path.join(out_dir, f"{vp_name}_{route_name}.png")
        print(f"[{count}/{total_tests}] Capturing {route_name} at {vp_size} -> {os.path.basename(out_file)}")
        args = [
            browser_path,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--hide-scrollbars",
            f"--window-size={vp_size}",
            "--virtual-time-budget=4000",
            f"--screenshot={out_file}",
            url
        ]
        try:
            res = subprocess.run(args, capture_output=True, timeout=20)
            if os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
                print(f"  [OK] SUCCESS: {os.path.getsize(out_file)} bytes")
            else:
                print(f"  [WARN] file empty or missing ({out_file})")
        except Exception as e:
            print(f"  [ERR] ERROR: {e}")
        time.sleep(0.5)

print("\nAll responsive test captures finished!")
