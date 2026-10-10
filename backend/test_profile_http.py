import urllib.request
import io
import json

boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
body = io.BytesIO()
body.write(b'------WebKitFormBoundary7MA4YWxkTrZu0gW\r\n')
body.write(b'Content-Disposition: form-data; name="target_table"\r\n\r\n')
body.write(b'purchase_orders\r\n')
body.write(b'------WebKitFormBoundary7MA4YWxkTrZu0gW\r\n')
body.write(b'Content-Disposition: form-data; name="file"; filename="purchase_orders.csv"\r\n')
body.write(b'Content-Type: text/csv\r\n\r\n')
body.write(b'po,manufacturer,sku,qty,expected_date,status\nPO-100,Mankind,PH-074,200,2026-11-24,confirmed\nPO-101,Alkem,PH-013,300,2026-11-14,delayed \xe2\x80\x93 supplier stock issue\r\n')
body.write(b'------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n')

data = body.getvalue()
req = urllib.request.Request(
    'http://localhost:8000/api/data/profile',
    data=data,
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
)
try:
    with urllib.request.urlopen(req, timeout=5) as resp:
        print('Profile Response Status:', resp.status)
        res_json = json.loads(resp.read().decode())
        print('Target Table:', res_json.get('target_table'))
        print('Total Rows:', res_json.get('total_rows'))
        print('Is Valid For Commit:', res_json.get('is_valid_for_commit'))
        print('Status:', res_json.get('status'))
        print('Missing Fields:', res_json.get('missing_mandatory_fields'))
except Exception as e:
    print('Error:', e)
